import { ForbiddenException } from '@nestjs/common';
import { CVService } from './cv.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { SubscriptionPlan } from '@flacroncv/shared-types';

function makeService(userPlan: SubscriptionPlan, aiParse?: string) {
  const firestore = new InMemoryFirestore();
  const firebaseAdmin = { firestore } as any;
  const usersService = {
    findByIdOrThrow: jest.fn().mockResolvedValue({
      uid: 'u1',
      email: 'u1@example.com',
      photoURL: null,
      profile: { website: '', linkedin: '', github: '' },
      subscription: { plan: userPlan, status: 'active' },
      usage: { cvsCreated: 0 },
    }),
    incrementUsage: jest.fn().mockResolvedValue(undefined),
  } as any;
  const aiService = {
    parseResume: jest.fn().mockResolvedValue({ content: aiParse ?? '{}', provider: 'openai' }),
  } as any;
  const service = new CVService(firebaseAdmin, usersService, aiService, {
    assertNewConsumption: jest.fn().mockResolvedValue(undefined),
  } as any);
  return { service, firestore, aiService };
}

async function seedTemplate(firestore: InMemoryFirestore, id: string, tier: string) {
  await firestore.collection('templates').doc(id).set({ id, tier });
}

async function seedCV(firestore: InMemoryFirestore, layout = 'classic') {
  await firestore.collection('cvs').doc('cv1').set({
    id: 'cv1',
    userId: 'u1',
    templateId: 'modern',
    styling: { layout, primaryColor: '#000000' },
    sectionOrder: [],
  });
}

describe('CVService template + layout tier enforcement', () => {
  // ─── T4: checkTemplateAccess is tier-ordered (via update's templateId path) ──
  describe('template tier (checkTemplateAccess)', () => {
    it('blocks a FREE user from a PRO template', async () => {
      const { service, firestore } = makeService(SubscriptionPlan.FREE);
      await seedCV(firestore);
      await seedTemplate(firestore, 'professional', 'pro');
      await expect(
        service.update('cv1', 'u1', { templateId: 'professional' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a PRO user a PRO template', async () => {
      const { service, firestore } = makeService(SubscriptionPlan.PRO);
      await seedCV(firestore);
      await seedTemplate(firestore, 'professional', 'pro');
      await expect(service.update('cv1', 'u1', { templateId: 'professional' })).resolves.toBeDefined();
    });

    it('blocks a PRO user from an ENTERPRISE template (tier ORDER, not binary)', async () => {
      const { service, firestore } = makeService(SubscriptionPlan.PRO);
      await seedCV(firestore);
      await seedTemplate(firestore, 'bold', 'enterprise');
      await expect(service.update('cv1', 'u1', { templateId: 'bold' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows an ENTERPRISE user an ENTERPRISE template', async () => {
      const { service, firestore } = makeService(SubscriptionPlan.ENTERPRISE);
      await seedCV(firestore);
      await seedTemplate(firestore, 'bold', 'enterprise');
      await expect(service.update('cv1', 'u1', { templateId: 'bold' })).resolves.toBeDefined();
    });
  });

  // ─── T1: styling.layout is tier-gated server-side ───────────────────────────
  describe('layout tier (styling.layout write-block)', () => {
    it('blocks a FREE user newly selecting a PRO layout (slate-gold)', async () => {
      const { service, firestore } = makeService(SubscriptionPlan.FREE);
      await seedCV(firestore, 'classic');
      await expect(
        service.update('cv1', 'u1', { styling: { layout: 'slate-gold' } as any }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a FREE user the compact layout (free — used by the free Compact template)', async () => {
      const { service, firestore } = makeService(SubscriptionPlan.FREE);
      await seedCV(firestore, 'classic');
      await expect(
        service.update('cv1', 'u1', { styling: { layout: 'compact' } as any }),
      ).resolves.toBeDefined();
    });

    it('allows RE-SENDING an already-stored PRO layout (downgrade keeps the document)', async () => {
      const { service, firestore } = makeService(SubscriptionPlan.FREE);
      await seedCV(firestore, 'slate-gold'); // stored while previously on PRO
      await expect(
        service.update('cv1', 'u1', { styling: { layout: 'slate-gold', primaryColor: '#fff' } as any }),
      ).resolves.toBeDefined();
    });

    it('allows a PRO user newly selecting a PRO layout', async () => {
      const { service, firestore } = makeService(SubscriptionPlan.PRO);
      await seedCV(firestore, 'classic');
      await expect(
        service.update('cv1', 'u1', { styling: { layout: 'slate-gold' } as any }),
      ).resolves.toBeDefined();
    });
  });

  // ─── L2: built-in template gating no longer fails open on an unseeded catalog ─
  describe('template gating without a seeded catalog (L2)', () => {
    it('blocks a FREE user from a built-in PRO template even when the catalog is empty', async () => {
      const { service, firestore } = makeService(SubscriptionPlan.FREE);
      await seedCV(firestore);
      // No seedTemplate() — the templates catalog is empty; the authoritative
      // CV_TEMPLATE_TIER map must still gate the built-in PRO 'professional'.
      await expect(service.update('cv1', 'u1', { templateId: 'professional' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows an unknown/custom template id that has no catalog doc', async () => {
      const { service, firestore } = makeService(SubscriptionPlan.FREE);
      await seedCV(firestore);
      await expect(
        service.update('cv1', 'u1', { templateId: 'custom-unknown-xyz' }),
      ).resolves.toBeDefined();
    });
  });

  // ─── B3: import from an existing resume (AI-parsed) ─────────────────────────
  describe('importFromResume (B3)', () => {
    it('builds a populated CV + sections from structured AI output', async () => {
      const parsed = JSON.stringify({
        firstName: 'Jane', lastName: 'Doe', headline: 'Engineer', email: 'jane@x.com',
        phone: '123', city: 'NYC', country: 'USA', summary: 'Experienced engineer.',
        experience: [{ position: 'Dev', company: 'Acme', startDate: '2020-01', endDate: '', description: 'Built things' }],
        education: [{ institution: 'MIT', degree: 'BSc', field: 'CS' }],
        skills: ['JavaScript', 'TypeScript'],
      });
      const { service } = makeService(SubscriptionPlan.FREE, parsed);

      const cv = await service.importFromResume('u1', { resumeText: 'raw resume text', title: 'My CV' });

      expect(cv.personalInfo.firstName).toBe('Jane');
      expect(cv.personalInfo.summary).toBe('Experienced engineer.');
      const sections = await service.getSections(cv.id);
      const exp = sections.find((s) => s.type === 'experience');
      expect(exp?.items).toHaveLength(1);
      expect((exp?.items[0] as any).company).toBe('Acme');
      expect(sections.find((s) => s.type === 'skills')?.items).toHaveLength(2);
    });

    it('keeps the raw text as the summary when the AI output is unparseable (no data lost)', async () => {
      const { service } = makeService(SubscriptionPlan.FREE, 'not valid json');
      const cv = await service.importFromResume('u1', { resumeText: 'MY RAW RESUME TEXT' });
      expect(cv.personalInfo.summary).toContain('MY RAW RESUME TEXT');
    });

    it('strips ```json fences from the AI output', async () => {
      const fenced =
        '```json\n{"firstName":"Bob","lastName":"","headline":"","email":"","phone":"","city":"","country":"","summary":"Hi","experience":[],"education":[],"skills":[]}\n```';
      const { service } = makeService(SubscriptionPlan.FREE, fenced);
      const cv = await service.importFromResume('u1', { resumeText: 'x' });
      expect(cv.personalInfo.firstName).toBe('Bob');
    });

    it('blocks import when the CV limit is reached', async () => {
      const { firestore } = makeService(SubscriptionPlan.FREE, '{}');
      // FREE cvs limit is small; simulate at-limit by mocking usage high via a fresh service.
      const usersService = {
        findByIdOrThrow: jest.fn().mockResolvedValue({
          uid: 'u1', email: 'u1@x.com', photoURL: null, profile: {},
          subscription: { plan: SubscriptionPlan.FREE, status: 'active' },
          usage: { cvsCreated: 9999 },
        }),
        incrementUsage: jest.fn(),
      } as any;
      const aiService = { parseResume: jest.fn() } as any;
      const limited = new CVService({ firestore } as any, usersService, aiService, {
        assertNewConsumption: jest.fn().mockResolvedValue(undefined),
      } as any);
      await expect(limited.importFromResume('u1', { resumeText: 'x' })).rejects.toThrow(ForbiddenException);
      expect(aiService.parseResume).not.toHaveBeenCalled(); // no AI credit spent when blocked
    });
  });

  describe('public sharing respects soft-delete (privacy)', () => {
    it('revokes the public share on delete → the public slug stops resolving', async () => {
      const { service, firestore } = makeService(SubscriptionPlan.FREE);
      await firestore.collection('cvs').doc('cvpub').set({
        id: 'cvpub',
        userId: 'u1',
        slug: 'my-cv',
        isPublic: true,
        publicSlug: 'my-cv-public',
        deletedAt: null,
        styling: { layout: 'classic' },
        sectionOrder: [],
      });

      expect(await service.findByPublicSlug('my-cv-public')).not.toBeNull();
      await service.delete('cvpub', 'u1');
      expect(await service.findByPublicSlug('my-cv-public')).toBeNull();
    });

    it('never serves a soft-deleted CV publicly even if share flags linger (legacy rows)', async () => {
      const { service, firestore } = makeService(SubscriptionPlan.FREE);
      await firestore.collection('cvs').doc('cvlegacy').set({
        id: 'cvlegacy',
        userId: 'u1',
        slug: 'x',
        isPublic: true,
        publicSlug: 'x-public',
        deletedAt: new Date().toISOString(), // already soft-deleted, flags left set
        styling: { layout: 'classic' },
        sectionOrder: [],
      });

      expect(await service.findByPublicSlug('x-public')).toBeNull();
    });
  });
});

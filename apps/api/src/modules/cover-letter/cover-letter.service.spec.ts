import { ForbiddenException } from '@nestjs/common';
import { CoverLetterService } from './cover-letter.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { SubscriptionPlan } from '@flacroncv/shared-types';

function makeService(userPlan: SubscriptionPlan) {
  const firestore = new InMemoryFirestore();
  const firebaseAdmin = { firestore } as any;
  const usersService = {
    findByIdOrThrow: jest.fn().mockResolvedValue({
      uid: 'u1',
      subscription: { plan: userPlan, status: 'active' },
      usage: { coverLettersCreated: 0 },
    }),
    incrementUsage: jest.fn().mockResolvedValue(undefined),
  } as any;
  const aiService = {} as any;
  const cvService = {} as any;
  const service = new CoverLetterService(firebaseAdmin, usersService, aiService, cvService);
  return { service, firestore };
}

async function seedCL(firestore: InMemoryFirestore, templateId = 'modern') {
  await firestore.collection('cover_letters').doc('cl1').set({
    id: 'cl1',
    userId: 'u1',
    templateId,
    styling: { fontFamily: 'Inter', fontSize: '16px', primaryColor: '#2563eb' },
    deletedAt: null,
  });
}

describe('CoverLetterService template tier enforcement', () => {
  describe('create', () => {
    it('blocks a FREE user creating with an ENTERPRISE template', async () => {
      const { service } = makeService(SubscriptionPlan.FREE);
      await expect(
        service.create('u1', { title: 'X', templateId: 'corporate' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks a PRO user creating with an ENTERPRISE template (tier order)', async () => {
      const { service } = makeService(SubscriptionPlan.PRO);
      await expect(
        service.create('u1', { title: 'X', templateId: 'corporate' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a FREE user creating with a free template', async () => {
      const { service } = makeService(SubscriptionPlan.FREE);
      const cl = await service.create('u1', { title: 'X', templateId: 'modern' } as any);
      expect(cl.templateId).toBe('modern');
    });

    it('allows a PRO user creating with a PRO template', async () => {
      const { service } = makeService(SubscriptionPlan.PRO);
      const cl = await service.create('u1', { title: 'X', templateId: 'minimalist' } as any);
      expect(cl.templateId).toBe('minimalist');
    });
  });

  describe('update', () => {
    it('blocks a FREE user newly selecting an ENTERPRISE template', async () => {
      const { service, firestore } = makeService(SubscriptionPlan.FREE);
      await seedCL(firestore, 'modern');
      await expect(
        service.update('cl1', 'u1', { templateId: 'corporate' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows RE-SENDING the stored template (downgrade keeps the document)', async () => {
      const { service, firestore } = makeService(SubscriptionPlan.FREE);
      await seedCL(firestore, 'corporate'); // stored while previously on ENTERPRISE
      await expect(
        service.update('cl1', 'u1', { templateId: 'corporate' } as any),
      ).resolves.toBeDefined();
    });

    it('allows a non-template update without touching templateId', async () => {
      const { service, firestore } = makeService(SubscriptionPlan.FREE);
      await seedCL(firestore, 'modern');
      await expect(
        service.update('cl1', 'u1', { title: 'New title' } as any),
      ).resolves.toBeDefined();
    });
  });
});

/**
 * "Create with AI" is one user action: if the generation fails, the user must
 * not be left with a blank cover letter that also consumed a quota slot. This
 * was the client-reported symptom — a timed-out generation produced an empty
 * entry in "My Cover Letters" and every retry burned another allowance.
 */
describe('CoverLetterService create+generate atomicity', () => {
  function makeAIService(plan: SubscriptionPlan, generate: jest.Mock) {
    const firestore = new InMemoryFirestore();
    const usersService = {
      findByIdOrThrow: jest.fn().mockResolvedValue({
        uid: 'u1',
        subscription: { plan, status: 'active' },
        usage: { coverLettersCreated: 0 },
      }),
      incrementUsage: jest.fn().mockResolvedValue(undefined),
    } as any;
    const aiService = { generateCoverLetter: generate } as any;
    const service = new CoverLetterService(
      { firestore } as any,
      usersService,
      aiService,
      {} as any,
    );
    return { service, firestore, usersService };
  }

  const aiPayload = {
    title: 'X',
    jobTitle: 'Engineer',
    companyName: 'Acme',
    generateWithAI: true,
  } as any;

  it('deletes the draft and refunds the quota when generation fails', async () => {
    const generate = jest.fn().mockRejectedValue(new Error('AI generation failed — timeout'));
    const { service, firestore, usersService } = makeAIService(SubscriptionPlan.PRO, generate);

    await expect(service.create('u1', aiPayload)).rejects.toThrow(/AI generation failed/);

    // No orphaned blank cover letter survives the failure.
    const remaining = await firestore.collection('cover_letters').get();
    expect(remaining.docs).toHaveLength(0);

    // The quota slot taken by the create is given back (+1 then -1).
    expect(usersService.incrementUsage).toHaveBeenCalledWith('u1', 'coverLettersCreated');
    expect(usersService.incrementUsage).toHaveBeenCalledWith('u1', 'coverLettersCreated', -1);
  });

  it('keeps the document and the quota when generation succeeds', async () => {
    const generate = jest
      .fn()
      .mockResolvedValue({ content: 'Dear hiring manager…', provider: 'openai' });
    const { service, firestore, usersService } = makeAIService(SubscriptionPlan.PRO, generate);

    const cl = await service.create('u1', aiPayload);
    // Stored as HTML, not as the model's raw prose: `content` is rendered
    // through dangerouslySetInnerHTML, where newlines are whitespace — so
    // storing it verbatim collapsed every multi-paragraph letter into one
    // block. See toLetterHtml in ./letter-html.
    expect(cl.content).toBe('<p>Dear hiring manager…</p>');
    expect(cl.aiGenerated).toBe(true);

    const remaining = await firestore.collection('cover_letters').get();
    expect(remaining.docs).toHaveLength(1);
    // Charged once, never refunded.
    expect(usersService.incrementUsage).toHaveBeenCalledTimes(1);
  });

  it('keeps the letter when the model succeeded but a later step failed', async () => {
    // The credit is spent the moment the model returns. If the failure happens
    // AFTER that (the content write, or the re-read), deleting the document
    // would destroy paid-for work the user can see no trace of.
    const generate = jest
      .fn()
      .mockResolvedValue({ content: 'Dear hiring manager…', provider: 'openai' });
    const { service, firestore, usersService } = makeAIService(SubscriptionPlan.PRO, generate);

    // Let the content write land, then fail the final re-read.
    const coll = firestore.collection('cover_letters');
    const realDoc = coll.doc.bind(coll);
    let getCalls = 0;
    jest.spyOn(coll, 'doc').mockImplementation((id: string) => {
      const ref = realDoc(id);
      const realGet = ref.get.bind(ref);
      ref.get = async () => {
        getCalls++;
        // 1st get: findByIdOrThrow inside generateWithAI (must succeed).
        // 2nd get: the content write's re-read — fail it.
        if (getCalls === 2) throw new Error('firestore read failed');
        return realGet();
      };
      return ref;
    });

    const result = await service.create('u1', aiPayload);

    expect(result.content).toBe('<p>Dear hiring manager…</p>');
    // Document survives, and the quota is NOT refunded — the credit was spent.
    const remaining = await firestore.collection('cover_letters').get();
    expect(remaining.docs).toHaveLength(1);
    expect(usersService.incrementUsage).not.toHaveBeenCalledWith('u1', 'coverLettersCreated', -1);
  });

  it('surfaces the original AI error even if the rollback itself fails', async () => {
    const generate = jest.fn().mockRejectedValue(new Error('AI generation failed — timeout'));
    const { service, usersService } = makeAIService(SubscriptionPlan.PRO, generate);
    // A refund failure must not mask the error the user needs to see.
    usersService.incrementUsage.mockImplementation((_u: string, _f: string, amount?: number) =>
      amount === -1 ? Promise.reject(new Error('firestore down')) : Promise.resolve(undefined),
    );

    await expect(service.create('u1', aiPayload)).rejects.toThrow(/AI generation failed/);
  });
});

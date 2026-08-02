import { NotFoundException } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { TemplateCategory, SubscriptionPlan } from '@flacroncv/shared-types';

function makeFirebaseAdmin(firestore: InMemoryFirestore) {
  return { firestore } as any;
}

describe('TemplatesService', () => {
  let service: TemplatesService;
  let firestore: InMemoryFirestore;

  beforeEach(() => {
    firestore = new InMemoryFirestore();
    service = new TemplatesService(makeFirebaseAdmin(firestore));
  });

  describe('list', () => {
    beforeEach(async () => {
      await service.create(
        { name: 'Modern', slug: 'modern', category: TemplateCategory.CV, tier: SubscriptionPlan.FREE },
        'system',
      );
      await service.create(
        { name: 'Pro', slug: 'pro-template', category: TemplateCategory.CV, tier: SubscriptionPlan.PRO },
        'system',
      );
      // One cover-letter template
      await service.create(
        { name: 'CL Basic', slug: 'cl-basic', category: TemplateCategory.COVER_LETTER, tier: SubscriptionPlan.FREE },
        'system',
      );
    });

    it('returns all active templates when no filters applied', async () => {
      const result = await service.list();
      expect(result.length).toBe(3);
    });

    it('filters by category', async () => {
      const result = await service.list(TemplateCategory.CV);
      expect(result.length).toBe(2);
      expect(result.every((t) => t.category === TemplateCategory.CV)).toBe(true);
    });

    it('filters by tier', async () => {
      const result = await service.list(undefined, SubscriptionPlan.PRO);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Pro');
    });
  });

  describe('findById', () => {
    it('throws NotFoundException for missing template', async () => {
      await expect(service.findById('does-not-exist')).rejects.toThrow(NotFoundException);
    });

    it('returns the template when found', async () => {
      await service.create({ name: 'Classic', slug: 'classic' }, 'system');
      const result = await service.findById('classic');
      expect(result.name).toBe('Classic');
    });
  });

  describe('create', () => {
    it('sets isActive=true and usageCount=0 by default', async () => {
      const template = await service.create({ name: 'New Template', slug: 'new-tmpl' }, 'admin');
      expect(template.isActive).toBe(true);
      expect(template.usageCount).toBe(0);
      expect(template.createdBy).toBe('admin');
    });
  });

  describe('delete', () => {
    it('soft-deletes the template (sets isActive=false)', async () => {
      await service.create({ name: 'To Delete', slug: 'to-delete' }, 'admin');

      await service.delete('to-delete');

      // Should not appear in list (list filters isActive == true)
      const templates = await service.list();
      expect(templates.find((t) => t.slug === 'to-delete')).toBeUndefined();
    });
  });

  describe('seedDefaults', () => {
    it('is idempotent — running twice does not duplicate templates', async () => {
      await service.seedDefaults();
      await service.seedDefaults();

      const result = await service.list();
      const slugs = result.map((t) => t.slug);
      const uniqueSlugs = new Set(slugs);
      expect(slugs.length).toBe(uniqueSlugs.size);
    });

    it('re-seeding updates code-owned fields on existing docs (L5 — tier propagates)', async () => {
      // Pre-create 'modern' with a stale/wrong tier.
      await service.create(
        { name: 'Modern', slug: 'modern', category: TemplateCategory.CV, tier: SubscriptionPlan.PRO },
        'system',
      );
      await service.seedDefaults();
      const modern = await service.findById('modern');
      expect(modern.tier).toBe(SubscriptionPlan.FREE); // corrected to the code value
    });
  });

  describe('public reads (L1 — data minimization)', () => {
    it('listPublic strips htmlTemplate/cssTemplate/createdBy/isActive', async () => {
      await service.create(
        { name: 'X', slug: 'x', htmlTemplate: '<div>secret</div>', cssTemplate: 'body{}' },
        'admin-uid',
      );
      const [t] = await service.listPublic();
      expect(t).not.toHaveProperty('htmlTemplate');
      expect(t).not.toHaveProperty('cssTemplate');
      expect(t).not.toHaveProperty('createdBy');
      expect(t).not.toHaveProperty('isActive');
      expect(t.name).toBe('X');
    });

    it('findPublicById returns a stripped template', async () => {
      await service.create({ name: 'Y', slug: 'y' }, 'admin-uid');
      const t = await service.findPublicById('y');
      expect(t).not.toHaveProperty('createdBy');
      expect(t.slug).toBe('y');
    });

    it('findPublicById throws NotFound for a soft-deleted (inactive) template', async () => {
      await service.create({ name: 'Z', slug: 'z' }, 'admin-uid');
      await service.delete('z'); // sets isActive=false
      await expect(service.findPublicById('z')).rejects.toThrow(NotFoundException);
    });
  });
});

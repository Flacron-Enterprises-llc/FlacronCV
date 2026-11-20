import { NotFoundException } from '@nestjs/common';
import { ExportService, PREVIEW_MAX_SECTIONS, previewDraft } from './export.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';

const cv = {
  id: 'cv1',
  userId: 'u1',
  templateId: 'modern',
  styling: { primaryColor: '#123456', fontFamily: 'Inter', showPhoto: false },
  personalInfo: { firstName: 'Ada', lastName: 'Stored', email: 'ada@example.test', summary: 'Stored summary' },
};
const stored = [{ id: 's1', type: 'skills', title: 'Skills', isVisible: true, order: 0, items: [{ name: 'StoredSkill' }] }];

function makeService() {
  const firestore = new InMemoryFirestore();
  const cvService = {
    findByIdOrThrow: jest.fn(async (id: string, uid: string) => {
      if (id !== 'cv1' || uid !== 'u1') throw new NotFoundException('CV not found');
      return { ...cv };
    }),
    getSections: jest.fn(async () => stored.map((s) => ({ ...s }))),
  };
  const usersService = { incrementUsage: jest.fn() };
  const service = new ExportService({ firestore } as any, cvService as any, {} as any, usersService as any, { assertNewConsumption: jest.fn() } as any);
  return { service, cvService, usersService, firestore };
}

describe('previewDraft', () => {
  it('keeps only the renderer inputs and ignores wrong types or oversize input', () => {
    expect(previewDraft({ templateId: 'classic', styling: { primaryColor: '#000' }, personalInfo: { firstName: 'A' }, sections: [{ type: 'summary' }], userId: 'evil', plan: 'business' }))
      .toEqual({ templateId: 'classic', styling: { primaryColor: '#000' }, personalInfo: { firstName: 'A' }, sections: [{ type: 'summary' }] });
    expect(previewDraft({ templateId: '../etc', styling: 'x', personalInfo: [1], sections: 'no' })).toEqual({});
    expect(previewDraft({ sections: Array.from({ length: PREVIEW_MAX_SECTIONS + 1 }, () => ({})) })).toEqual({});
    expect(previewDraft({ sections: [{ text: 'x'.repeat(250_000) }] })).toEqual({});
    expect(previewDraft(null)).toEqual({});
    expect(previewDraft([1, 2])).toEqual({});
  });
});

describe('ExportService.previewCVHtml', () => {
  it('renders the stored CV for its owner and counts no export', async () => {
    const { service, cvService, usersService, firestore } = makeService();
    const { html } = await service.previewCVHtml('cv1', 'u1', {});
    expect(html).toContain('Ada');
    expect(html).toContain('Stored summary');
    expect(html).toContain('StoredSkill');
    expect(cvService.findByIdOrThrow).toHaveBeenCalledWith('cv1', 'u1');
    expect(usersService.incrementUsage).not.toHaveBeenCalled();
    expect((await firestore.collection('export_reservations').get()).size ?? 0).toBe(0);
  });

  it('applies unsaved editor values (name, sections, colour) without saving them', async () => {
    const { service, cvService } = makeService();
    const { html } = await service.previewCVHtml('cv1', 'u1', {
      personalInfo: { lastName: 'Draftname', summary: 'Typed just now' },
      styling: { primaryColor: '#abcdef' },
      sections: [{ id: 's1', type: 'skills', title: 'Skills', isVisible: true, order: 0, items: [{ name: 'DraftSkill' }] }],
    });
    expect(html).toContain('Draftname');
    expect(html).toContain('Typed just now');
    expect(html).not.toContain('Stored summary');
    expect(html).toContain('DraftSkill');
    expect(html).not.toContain('StoredSkill');
    expect(html.toLowerCase()).toContain('#abcdef');
    expect(cvService.getSections).not.toHaveBeenCalled();
  });

  it("refuses someone else's CV", async () => {
    const { service } = makeService();
    await expect(service.previewCVHtml('cv1', 'intruder', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('escapes markup typed into the editor', async () => {
    const { service } = makeService();
    const { html } = await service.previewCVHtml('cv1', 'u1', { personalInfo: { firstName: '<script>alert(1)</script>' } });
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});

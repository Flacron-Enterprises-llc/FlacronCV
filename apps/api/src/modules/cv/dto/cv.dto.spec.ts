import { BadRequestException } from '@nestjs/common';
import { CVStatus, CVSectionType, FontSize, Spacing } from '@flacroncv/shared-types';
import { transformBody } from '../../../common/test/app-validation-pipe';
import { CreateCvDto } from './create-cv.dto';
import { ImportCvDto } from './import-cv.dto';
import { UpdateCvDto } from './update-cv.dto';
import { AddSectionDto, UpdateSectionDto } from './section.dto';

async function expectReject(cls: new () => object, payload: unknown) {
  await expect(transformBody(cls, payload)).rejects.toBeInstanceOf(BadRequestException);
}

describe('CV write DTOs (ValidationPipe)', () => {
  describe('CreateCvDto', () => {
    it('accepts the web create payload', async () => {
      const result = await transformBody(CreateCvDto, { title: 'My CV', templateId: 'modern' });
      expect(result.title).toBe('My CV');
      expect(result.templateId).toBe('modern');
    });

    it('accepts the mobile create payload shape', async () => {
      // Exact keys from apps/mobile/app/(dashboard)/cvs/new.tsx.
      const result = await transformBody(CreateCvDto, {
        title: 'Software Engineer CV',
        templateId: 'modern',
        status: CVStatus.DRAFT,
        isPublic: false,
        personalInfo: {
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
          phone: '',
        },
        styling: {
          primaryColor: '#2563eb',
          fontFamily: 'Inter',
          fontSize: FontSize.MEDIUM,
          spacing: Spacing.NORMAL,
          showPhoto: false,
        },
        sectionOrder: [],
      });
      expect(result.title).toBe('Software Engineer CV');
      expect(result.personalInfo?.firstName).toBe('Ada');
      expect(result.styling?.fontFamily).toBe('Inter');
    });

    it('rejects an unknown field', async () => {
      await expectReject(CreateCvDto, { title: 'My CV', templateId: 'modern', userId: 'u1' });
    });

    it('rejects a malformed title', async () => {
      await expectReject(CreateCvDto, { title: '   ', templateId: 'modern' });
      await expectReject(CreateCvDto, { templateId: 'modern' });
    });
  });

  describe('ImportCvDto', () => {
    it('accepts title + resumeText', async () => {
      const result = await transformBody(ImportCvDto, { title: 'Imported', resumeText: 'Ada Lovelace\nEngineer' });
      expect(result.resumeText).toContain('Ada');
    });

    it('rejects missing resumeText and unknown fields', async () => {
      await expectReject(ImportCvDto, { title: 'Imported' });
      await expectReject(ImportCvDto, { resumeText: 'text', extra: true });
    });
  });

  describe('UpdateCvDto', () => {
    it('accepts the web autosave payload including photoURL null', async () => {
      const result = await transformBody(UpdateCvDto, {
        title: 'My CV',
        personalInfo: {
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.com',
          phone: '',
          address: '',
          city: '',
          country: '',
          postalCode: '',
          website: '',
          linkedin: '',
          github: '',
          photoURL: null,
          headline: '',
          summary: '',
        },
        styling: {
          primaryColor: '#2563eb',
          fontFamily: 'Inter',
          fontSize: FontSize.MEDIUM,
          spacing: Spacing.NORMAL,
          showPhoto: false,
          layout: 'classic',
          sectionStyle: 'underline',
          borderRadius: 'small',
        },
        sectionOrder: ['s1'],
      });
      expect(result.personalInfo?.photoURL).toBeNull();
      expect(result.styling?.layout).toBe('classic');
    });

    it('rejects extra nested personalInfo keys', async () => {
      await expectReject(UpdateCvDto, {
        personalInfo: { firstName: 'Ada', twitter: 'handle' },
      });
    });

    it('rejects extra nested styling keys', async () => {
      await expectReject(UpdateCvDto, {
        styling: { fontFamily: 'Inter', customCss: 'body{}' },
      });
    });
  });

  describe('section DTOs', () => {
    it('accepts a new section with a legacy extra key on an item', async () => {
      const result = await transformBody(AddSectionDto, {
        id: 's1',
        type: CVSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        isVisible: true,
        items: [
          {
            id: 'e1',
            company: 'Acme',
            position: 'Engineer',
            location: '',
            startDate: '2020-01',
            endDate: null,
            isCurrent: true,
            description: '',
            highlights: ['Shipped'],
            order: 0,
            legacyKey: 'kept',
          },
        ],
      });
      expect((result.items?.[0] as { legacyKey?: string }).legacyKey).toBe('kept');
    });

    it('rejects a known field with the wrong type', async () => {
      await expectReject(AddSectionDto, {
        type: CVSectionType.EXPERIENCE,
        title: 'Experience',
        order: 0,
        items: [{ company: 12 }],
      });
    });

    it('rejects an unknown section type and unknown top-level keys', async () => {
      await expectReject(AddSectionDto, {
        type: 'not-a-section',
        title: 'X',
        order: 0,
      });
      await expectReject(UpdateSectionDto, { title: 'X', userId: 'u1' });
    });
  });
});

import { BadRequestException } from '@nestjs/common';
import { CoverLetterStatus } from '@flacroncv/shared-types';
import { transformBody } from '../../../common/test/app-validation-pipe';
import { CreateCoverLetterDto } from './create-cover-letter.dto';
import { UpdateCoverLetterDto } from './update-cover-letter.dto';
import { GenerateCoverLetterDto } from './generate-cover-letter.dto';

async function expectReject(cls: new () => object, payload: unknown) {
  await expect(transformBody(cls, payload)).rejects.toBeInstanceOf(BadRequestException);
}

describe('Cover-letter write DTOs (ValidationPipe)', () => {
  describe('CreateCoverLetterDto', () => {
    it('accepts the web create payload', async () => {
      const result = await transformBody(CreateCoverLetterDto, {
        title: 'Acme letter',
        recipientName: 'Hiring Manager',
        companyName: 'Acme',
        jobTitle: 'Engineer',
        jobDescription: 'Build things',
        linkedCVId: 'cv-1',
      });
      expect(result.title).toBe('Acme letter');
    });

    it('accepts the mobile create payload shape', async () => {
      // Exact keys from apps/mobile/app/(dashboard)/cover-letters/new.tsx.
      const result = await transformBody(CreateCoverLetterDto, {
        title: 'Acme letter',
        jobTitle: 'Engineer',
        companyName: 'Acme',
        recipientName: '',
        recipientTitle: '',
        jobDescription: '',
        content: '',
        templateId: 'modern',
        status: CoverLetterStatus.DRAFT,
        aiGenerated: false,
        styling: { fontFamily: 'Inter', fontSize: '14px', primaryColor: '#2563eb' },
      });
      expect(result.title).toBe('Acme letter');
      expect(result.recipientName).toBe('');
      expect(result.styling?.fontSize).toBe('14px');
    });

    it('rejects an unknown field', async () => {
      await expectReject(CreateCoverLetterDto, { title: 'X', userId: 'u1' });
    });

    it('rejects a blank title', async () => {
      await expectReject(CreateCoverLetterDto, { title: '  ' });
    });
  });

  describe('UpdateCoverLetterDto', () => {
    it('accepts the web autosave payload', async () => {
      const result = await transformBody(UpdateCoverLetterDto, {
        title: 'Acme letter',
        templateId: 'modern',
        recipientName: 'Pat',
        recipientTitle: 'Head of Eng',
        companyName: 'Acme',
        companyAddress: '1 Road',
        jobTitle: 'Engineer',
        jobDescription: 'Build',
        content: '<p>Hello</p>',
        styling: { fontFamily: 'Inter', fontSize: '16px', primaryColor: '#2563eb' },
      });
      expect(result.content).toContain('Hello');
    });

    it('rejects extra styling keys', async () => {
      await expectReject(UpdateCoverLetterDto, {
        styling: { fontFamily: 'Inter', customCss: 'p{}' },
      });
    });
  });

  describe('GenerateCoverLetterDto', () => {
    it('accepts the editor generate payload including empty strings', async () => {
      const result = await transformBody(GenerateCoverLetterDto, {
        jobTitle: '',
        jobDescription: '',
        companyName: '',
        tone: 'professional',
        language: 'English',
      });
      expect(result.tone).toBe('professional');
    });

    it('rejects an unknown tone and unknown fields', async () => {
      await expectReject(GenerateCoverLetterDto, {
        jobTitle: 'E',
        jobDescription: '',
        companyName: 'A',
        tone: 'casual',
      });
      await expectReject(GenerateCoverLetterDto, {
        jobTitle: 'E',
        jobDescription: '',
        companyName: 'A',
        tone: 'professional',
        model: 'gpt-4o',
      });
    });
  });
});

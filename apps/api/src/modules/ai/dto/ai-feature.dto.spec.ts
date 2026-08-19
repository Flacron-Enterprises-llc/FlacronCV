import { BadRequestException } from '@nestjs/common';
import { transformBody } from '../../../common/test/app-validation-pipe';
import { GenerateDto } from './generate.dto';
import {
  AtsCheckDto,
  GenerateAiCoverLetterDto,
  GenerateCvSummaryDto,
  GenerateJobDescriptionDto,
  ImproveSectionDto,
  InterviewPrepDto,
  LinkedinOptimizeDto,
  SuggestSkillsDto,
  TranslateContentDto,
} from './ai-feature.dto';

async function expectReject(cls: new () => object, payload: unknown) {
  await expect(transformBody(cls, payload)).rejects.toBeInstanceOf(BadRequestException);
}

describe('AI feature DTOs (ValidationPipe)', () => {
  it('rejects a model override on /ai/generate', async () => {
    await expectReject(GenerateDto, { prompt: 'hello', model: 'gpt-4o' });
  });

  it('accepts cv-summary as the web modal sends it', async () => {
    const result = await transformBody(GenerateCvSummaryDto, {
      experience: 'mid level engineer',
      skills: 'TypeScript, React',
      targetRole: 'Staff engineer',
      language: 'English',
    });
    expect(result.targetRole).toBe('Staff engineer');
  });

  it('accepts cover-letter generation including empty candidateSummary', async () => {
    const result = await transformBody(GenerateAiCoverLetterDto, {
      jobTitle: 'Engineer',
      jobDescription: 'Build APIs',
      companyName: 'Acme',
      candidateSummary: '',
      tone: 'professional',
      length: 'medium',
      language: 'English',
    });
    expect(result.length).toBe('medium');
  });

  it('accepts interview-prep with an empty cvContent string', async () => {
    const result = await transformBody(InterviewPrepDto, {
      jobDescription: 'Engineer role',
      cvContent: '',
    });
    expect(result.cvContent).toBe('');
  });

  it.each([
    [ImproveSectionDto, { sectionType: 'summary', content: 'text', extra: 1 }],
    [TranslateContentDto, { content: 'text', targetLanguage: 'French', extra: 1 }],
    [SuggestSkillsDto, { experience: 'x', currentSkills: '', extra: 1 }],
    [GenerateJobDescriptionDto, { jobTitle: 'Engineer', extra: 1 }],
    [AtsCheckDto, { cvContent: 'cv', jobDescription: 'job', extra: 1 }],
    [LinkedinOptimizeDto, { cvContent: 'cv', extra: 1 }],
  ] as const)('rejects an unknown field on %p', async (cls, payload) => {
    await expectReject(cls, payload);
  });

  it('rejects oversize content', async () => {
    await expectReject(ImproveSectionDto, {
      sectionType: 'summary',
      content: 'x'.repeat(20001),
    });
  });
});

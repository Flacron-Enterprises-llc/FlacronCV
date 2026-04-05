import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AIService } from './ai.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';

@ApiTags('ai')
@Controller('ai')
@UseGuards(FirebaseAuthGuard)
@ApiBearerAuth()
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Post('generate')
  async generate(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { prompt: string; maxTokens?: number; temperature?: number },
  ) {
    return this.aiService.generate(body.prompt, body, user.uid);
  }

  @Post('improve')
  async improve(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { sectionType: string; content: string; language?: string },
  ) {
    return this.aiService.improveSection(body.sectionType, body.content, user.uid, body.language);
  }

  @Post('translate')
  async translate(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { content: string; targetLanguage: string },
  ) {
    return this.aiService.translateContent(body.content, body.targetLanguage, user.uid);
  }

  @Post('cv-summary')
  async generateCVSummary(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { experience: string; skills: string; targetRole: string; language?: string },
  ) {
    return this.aiService.generateCVSummary(body.experience, body.skills, body.targetRole, user.uid, body.language);
  }

  @Post('suggest-skills')
  async suggestSkills(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { experience: string; currentSkills: string },
  ) {
    return this.aiService.suggestSkills(body.experience, body.currentSkills, user.uid);
  }

  @Post('generate-job-description')
  async generateJobDescription(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { jobTitle: string; companyName?: string; language?: string },
  ) {
    return this.aiService.generateJobDescription(body.jobTitle, body.companyName, user.uid, body.language);
  }

  @Post('cover-letter')
  async generateCoverLetter(
    @CurrentUser() user: FirebaseUser,
    @Body()
    body: {
      jobTitle: string;
      jobDescription: string;
      companyName: string;
      candidateSummary: string;
      tone: string;
      language?: string;
    },
  ) {
    return this.aiService.generateCoverLetter(
      body.jobTitle,
      body.jobDescription,
      body.companyName,
      body.candidateSummary,
      body.tone,
      user.uid,
      body.language,
    );
  }

  @Post('ats-check')
  async atsCheck(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { cvContent: string; jobDescription: string },
  ) {
    return this.aiService.atsCheck(body.cvContent, body.jobDescription, user.uid);
  }
}

import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { AIService } from './ai.service';
import { GenerateDto } from './dto/generate.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { FeatureFlagGuard, RequireFeature } from '../../common/guards/feature-flag.guard';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-actions';
import { AIProviderResponse } from './providers/ai-provider.interface';

/**
 * Body of POST /ai/regenerate-paragraph.
 *
 * A real class (not an inline interface) so the global ValidationPipe can
 * actually see it: an interface is erased at runtime, which is why the older
 * routes on this controller are effectively unvalidated. The caps matter here
 * because both fields are pasted straight into a prompt, and prompt size is
 * billed per call — `letter` carries a whole rich-text document.
 */
export class RegenerateParagraphDto {
  /** The full cover letter, as plain text — context only; it is never rewritten. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  letter!: string;

  /** The one paragraph to replace. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  paragraph!: string;

  /** Human-readable language name (e.g. "French"). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

@ApiTags('ai')
@Controller('ai')
@UseGuards(FirebaseAuthGuard, FeatureFlagGuard)
@RequireFeature('aiEnabled')
@ApiBearerAuth()
export class AIController {
  constructor(
    private readonly aiService: AIService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Run a generation and record it in the audit trail.
   *
   * Wrapping here rather than inside AIService keeps the actor's email/role
   * (which the service never receives) on the audit row, and means a failed
   * generation writes nothing — only work that actually spent a credit is
   * recorded. Metadata is limited to provider/model/tokens: prompts and
   * generated content are the user's own material and are not copied into a
   * log that administrators can read.
   */
  private async withAudit(
    user: FirebaseUser,
    feature: string,
    run: () => Promise<AIProviderResponse>,
  ): Promise<AIProviderResponse> {
    const result = await run();
    await this.audit.logUserAction(
      AuditAction.AI_GENERATION,
      { uid: user.uid, email: user.email, role: (user as Record<string, unknown>).role as string },
      'ai',
      feature,
      {
        metadata: {
          feature,
          provider: result.provider,
          model: result.model,
          tokensUsed: result.tokensUsed,
          latencyMs: result.latencyMs,
        },
      },
    );
    return result;
  }

  @Post('generate')
  async generate(@CurrentUser() user: FirebaseUser, @Body() body: GenerateDto) {
    // Pass only the vetted fields — never the raw body — so an unexpected key
    // (e.g. a `model` override) can't reach the provider. AIService also clamps.
    return this.withAudit(user, 'generate', () =>
      this.aiService.generate(
        body.prompt,
        { maxTokens: body.maxTokens, temperature: body.temperature },
        user.uid,
      ),
    );
  }

  @Post('improve')
  async improve(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { sectionType: string; content: string; language?: string },
  ) {
    return this.withAudit(user, 'improve', () =>
      this.aiService.improveSection(body.sectionType, body.content, user.uid, body.language),
    );
  }

  @Post('translate')
  async translate(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { content: string; targetLanguage: string },
  ) {
    return this.withAudit(user, 'translate', () =>
      this.aiService.translateContent(body.content, body.targetLanguage, user.uid),
    );
  }

  @Post('cv-summary')
  async generateCVSummary(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { experience: string; skills: string; targetRole: string; language?: string },
  ) {
    return this.withAudit(user, 'cv-summary', () =>
      this.aiService.generateCVSummary(body.experience, body.skills, body.targetRole, user.uid, body.language),
    );
  }

  @Post('suggest-skills')
  async suggestSkills(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { experience: string; currentSkills: string },
  ) {
    return this.withAudit(user, 'suggest-skills', () =>
      this.aiService.suggestSkills(body.experience, body.currentSkills, user.uid),
    );
  }

  @Post('generate-job-description')
  async generateJobDescription(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { jobTitle: string; companyName?: string; language?: string },
  ) {
    return this.withAudit(user, 'generate-job-description', () =>
      this.aiService.generateJobDescription(body.jobTitle, body.companyName, user.uid, body.language),
    );
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
      /** 'short' | 'medium' | 'long'. Anything else falls back to medium. */
      length?: string;
    },
  ) {
    return this.withAudit(user, 'cover-letter', () =>
      this.aiService.generateCoverLetter(
        body.jobTitle,
        body.jobDescription,
        body.companyName,
        body.candidateSummary,
        body.tone,
        user.uid,
        body.language,
        body.length,
      ),
    );
  }

  /**
   * Rewrite a single paragraph of a cover letter the user is editing.
   *
   * Goes through AIService.generate like every other route here, so the atomic
   * credit reserve/refund applies: it costs one credit, and costs nothing if
   * the model fails. The letter is passed in from the editor rather than read
   * from Firestore because the user may have unsaved edits on screen — and the
   * uid still comes from the verified token, never the body.
   */
  @Post('regenerate-paragraph')
  async regenerateParagraph(
    @CurrentUser() user: FirebaseUser,
    @Body() body: RegenerateParagraphDto,
  ) {
    return this.withAudit(user, 'regenerate-paragraph', () =>
      this.aiService.regenerateParagraph(body.letter, body.paragraph, user.uid, body.language),
    );
  }

  @Post('ats-check')
  async atsCheck(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { cvContent: string; jobDescription: string },
  ) {
    return this.withAudit(user, 'ats-check', () =>
      this.aiService.atsCheck(body.cvContent, body.jobDescription, user.uid),
    );
  }

  @Post('interview-prep')
  async interviewPrep(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { jobDescription: string; cvContent?: string },
  ) {
    return this.withAudit(user, 'interview-prep', () =>
      this.aiService.interviewPrep(body.jobDescription, body.cvContent ?? '', user.uid),
    );
  }

  @Post('linkedin')
  async linkedin(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { cvContent: string; targetRole?: string },
  ) {
    return this.withAudit(user, 'linkedin', () =>
      this.aiService.linkedinOptimize(body.cvContent, body.targetRole ?? '', user.uid),
    );
  }
}

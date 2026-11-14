import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Provider } from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { InterviewService, MeteringService } from '@flacroncv/career-server';
import type { Principal, TextModel } from '@flacroncv/career-server';
import { INTERVIEW_STAGES, MAX_INTERVIEW_QUESTIONS, MAX_INTERVIEW_ROLE, MIN_INTERVIEW_QUESTIONS } from '@flacroncv/career-shared';
import { TEXT_MODEL } from '../ai/ai.providers';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';
import { IdempotencyKey } from '../metering/metering.providers';

/** A saved listing, or a typed target role for practice without one (the service requires one of them). */
class StartDto {
  @IsOptional()
  @IsUUID()
  opportunityId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(MAX_INTERVIEW_ROLE)
  role?: string;

  @IsIn(INTERVIEW_STAGES)
  stage!: string;

  @IsOptional()
  @IsInt()
  @Min(MIN_INTERVIEW_QUESTIONS)
  @Max(MAX_INTERVIEW_QUESTIONS)
  questionCount?: number;
}

class AnswerDto {
  @IsString()
  @MaxLength(10000)
  answer!: string;
}

class ChallengeDto {
  @IsUUID()
  answerId!: string;

  @IsString()
  @MaxLength(2000)
  note!: string;
}

class StoryDto {
  @IsString()
  @MaxLength(2000)
  situation!: string;

  @IsString()
  @MaxLength(2000)
  task!: string;

  @IsString()
  @MaxLength(2000)
  action!: string;

  @IsString()
  @MaxLength(2000)
  result!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  factIds?: string[];
}

export const interviewProviders: Provider[] = [
  {
    provide: InterviewService,
    inject: [DatabaseService, TEXT_MODEL, MeteringService],
    useFactory: (database: DatabaseService, model: TextModel, metering: MeteringService) =>
      new InterviewService(database.connectionPool, model, metering),
  },
];

@Controller()
export class InterviewsController {
  constructor(@Inject(InterviewService) private readonly interviews: InterviewService) {}

  @Get('interviews/text')
  list(@CurrentPrincipal() principal: Principal) {
    return this.interviews.list(principal);
  }

  @Post('interviews/text')
  async start(
    @CurrentPrincipal() principal: Principal,
    @Body() body: StartDto,
    @IdempotencyKey() idempotencyKey: string | undefined,
  ) {
    const out = await this.interviews.start(principal, body, idempotencyKey);
    return {
      session: out.result,
      usage: { ...out.usage, renewalDate: out.usage.renewalDate.toISOString() },
      jobId: out.jobId,
      replayed: out.replayed,
    };
  }

  @Get('interviews/text/:sessionId')
  get(@CurrentPrincipal() principal: Principal, @Param('sessionId') sessionId: string) {
    return this.interviews.get(principal, sessionId);
  }

  @Post('interviews/text/:sessionId/answers')
  answer(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId') sessionId: string,
    @Body() body: AnswerDto,
  ) {
    return this.interviews.answer(principal, sessionId, body);
  }

  @Post('interviews/text/:sessionId/challenges')
  challenge(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId') sessionId: string,
    @Body() body: ChallengeDto,
  ) {
    return this.interviews.challenge(principal, sessionId, body);
  }

  @Get('star-stories')
  stories(@CurrentPrincipal() principal: Principal) {
    return this.interviews.stories(principal);
  }

  @Post('star-stories')
  createStory(@CurrentPrincipal() principal: Principal, @Body() body: StoryDto) {
    return this.interviews.createStory(principal, body);
  }

  @Patch('star-stories/:storyId')
  updateStory(@CurrentPrincipal() principal: Principal, @Param('storyId') storyId: string, @Body() body: StoryDto) {
    return this.interviews.updateStory(principal, storyId, body);
  }

  @Delete('star-stories/:storyId')
  deleteStory(@CurrentPrincipal() principal: Principal, @Param('storyId') storyId: string) {
    return this.interviews.deleteStory(principal, storyId);
  }
}

import { Body, Controller, Get, Inject, Param, Post, Provider } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { InterviewService, MeteringService } from '@flacroncv/career-server';
import type { Principal, TextModel } from '@flacroncv/career-server';
import { INTERVIEW_STAGES } from '@flacroncv/career-shared';
import { TEXT_MODEL } from '../ai/ai.providers';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';
import { IdempotencyKey } from '../metering/metering.providers';

class StartDto {
  @IsUUID()
  opportunityId!: string;

  @IsIn(INTERVIEW_STAGES)
  stage!: string;
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
}

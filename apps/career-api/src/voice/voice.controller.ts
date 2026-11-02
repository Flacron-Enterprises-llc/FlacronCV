import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Provider } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { VoiceInterviewService } from '@flacroncv/career-server';
import type { Principal } from '@flacroncv/career-server';
import { INTERVIEW_STAGES, MAX_VOICE_RECORD_SECONDS, TRANSCRIPTION_LANGUAGES, TRANSCRIPTION_MAX_BYTES, TRANSCRIPTION_MIME_TYPES } from '@flacroncv/career-shared';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';
import { IdempotencyKey } from '../metering/metering.providers';

class StartVoiceDto {
  @IsIn(['practice', 'negotiation'])
  kind!: string;

  @IsOptional()
  @IsUUID()
  opportunityId?: string;

  @IsOptional()
  @IsIn(INTERVIEW_STAGES)
  stage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  offer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  salarySource?: string;
}

class RecordVoiceDto {
  @IsInt()
  @Min(1)
  @Max(MAX_VOICE_RECORD_SECONDS)
  durationSeconds!: number;

  @IsString()
  @MaxLength(10000)
  transcript!: string;
}

class TranscriptDto {
  @IsString()
  @MaxLength(10000)
  transcript!: string;
}

class TranscribeVoiceDto {
  @IsIn(TRANSCRIPTION_LANGUAGES)
  language!: string;

  @IsOptional()
  @IsIn(TRANSCRIPTION_MIME_TYPES)
  mimeType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(TRANSCRIPTION_MAX_BYTES)
  byteLength?: number;
}

export const voiceProviders: Provider[] = [
  {
    provide: VoiceInterviewService,
    inject: [DatabaseService],
    useFactory: (database: DatabaseService) => new VoiceInterviewService(database.connectionPool),
  },
];

@Controller()
export class VoiceController {
  constructor(@Inject(VoiceInterviewService) private readonly voice: VoiceInterviewService) {}

  @Get('interviews/voice')
  list(@CurrentPrincipal() principal: Principal) {
    return this.voice.list(principal);
  }

  @Post('interviews/voice/consent')
  consent(@CurrentPrincipal() principal: Principal) {
    return this.voice.consent(principal);
  }

  @Post('interviews/voice')
  start(@CurrentPrincipal() principal: Principal, @Body() body: StartVoiceDto) {
    return this.voice.start(principal, body);
  }

  @Post('interviews/voice/:sessionId/recording')
  record(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId') sessionId: string,
    @Body() body: RecordVoiceDto,
    @IdempotencyKey() idempotencyKey: string | undefined,
  ) {
    return this.voice.record(principal, sessionId, body, idempotencyKey);
  }

  @Post('interviews/voice/:sessionId/transcription')
  transcribe(@CurrentPrincipal() principal: Principal, @Param('sessionId') sessionId: string, @Body() body: TranscribeVoiceDto) {
    return this.voice.transcribe(principal, sessionId, body);
  }

  @Patch('interviews/voice/:sessionId/transcript')
  correct(@CurrentPrincipal() principal: Principal, @Param('sessionId') sessionId: string, @Body() body: TranscriptDto) {
    return this.voice.correctTranscript(principal, sessionId, body.transcript);
  }

  @Delete('interviews/voice/:sessionId/audio')
  removeAudio(@CurrentPrincipal() principal: Principal, @Param('sessionId') sessionId: string) {
    return this.voice.deleteAudio(principal, sessionId);
  }
}

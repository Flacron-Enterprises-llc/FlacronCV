import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Provider, Req } from '@nestjs/common';
import type { Request } from 'express';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { BillingError, VoiceInterviewService } from '@flacroncv/career-server';
import type { ObjectStorage, Principal } from '@flacroncv/career-server';
import { INTERVIEW_STAGES, TRANSCRIPTION_LANGUAGES, TRANSCRIPTION_MAX_BYTES, TRANSCRIPTION_MIME_TYPES, VOICE_UPLOAD_MAX_BYTES, voiceAudioContentType } from '@flacroncv/career-shared';
import { CurrentPrincipal } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';
import { IdempotencyKey } from '../metering/metering.providers';
import { OBJECT_STORAGE } from '../storage/storage.providers';

class StartVoiceDto {
  @IsIn(['practice', 'negotiation'])
  kind!: string;

  @IsOptional()
  @IsUUID()
  opportunityId?: string;

  /** A role to practice for when there is no saved listing. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  role?: string;

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
    inject: [DatabaseService, OBJECT_STORAGE],
    // No speech provider is connected yet: the service's default transcriber answers provider_unavailable.
    useFactory: (database: DatabaseService, storage: ObjectStorage) =>
      new VoiceInterviewService(database.connectionPool, undefined, undefined, storage),
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

  /** Withdrawing recording consent; a privacy right, so it is never behind the feature switch. */
  @Delete('interviews/voice/consent')
  withdrawConsent(@CurrentPrincipal() principal: Principal) {
    return this.voice.withdrawConsent(principal);
  }

  @Post('interviews/voice')
  start(@CurrentPrincipal() principal: Principal, @Body() body: StartVoiceDto) {
    return this.voice.start(principal, body);
  }

  /**
   * The recorded take as a raw body with its own Content-Type (audio/webm,
   * audio/ogg or audio/mp4, as MediaRecorder wrote it) and an optional
   * X-Transcription-Language (en or fr). The server measures the length from
   * the file and meters those seconds; no client duration is accepted.
   */
  @Post('interviews/voice/:sessionId/recording')
  async record(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
    @Headers('content-type') contentType: string | undefined,
    @Headers('x-transcription-language') language: string | undefined,
    @IdempotencyKey() idempotencyKey: string | undefined,
  ) {
    const body = voiceAudioContentType(contentType) ? await readAudioBody(req, VOICE_UPLOAD_MAX_BYTES) : undefined;
    return this.voice.record(principal, sessionId, { body, contentType, language }, idempotencyKey);
  }

  /** A five-minute playback link for the caller's own stored take. */
  @Get('interviews/voice/:sessionId/audio')
  audioLink(@CurrentPrincipal() principal: Principal, @Param('sessionId') sessionId: string) {
    return this.voice.audioLink(principal, sessionId);
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

/**
 * Reads the request body for an audio type. The app's body parsers only
 * handle JSON and evidence file types, so audio arrives unread; this stops
 * at the size limit instead of buffering an oversized upload.
 */
export async function readAudioBody(req: Request, maxBytes: number): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new BillingError('validation_error', { field: 'audio', reason: 'too_large', limit: maxBytes });
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    const part = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    total += part.length;
    if (total > maxBytes) {
      req.resume();
      throw new BillingError('validation_error', { field: 'audio', reason: 'too_large', limit: maxBytes });
    }
    chunks.push(part);
  }
  return Buffer.concat(chunks);
}

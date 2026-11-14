import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CoverLetterStatus, CreateCoverLetterData } from '@flacroncv/shared-types';
import { CoverLetterStylingDto } from './cover-letter-styling.dto';
import { LETTER_LOCALES, LetterLocale } from '../letter-locale';

const TONES = ['professional', 'friendly', 'enthusiastic', 'formal'] as const;

export class CreateCoverLetterDto implements CreateCoverLetterData {
  @IsString()
  @Matches(/\S/, { message: 'title is required' })
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  templateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  linkedCVId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  jobDescription?: string;

  @IsOptional()
  @IsBoolean()
  generateWithAI?: boolean;

  @IsOptional()
  @IsIn(TONES, { message: `tone must be one of: ${TONES.join(', ')}` })
  tone?: (typeof TONES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;

  /**
   * Locale code of the language the letter is WRITTEN in (not the interface
   * language). Drives the salutation/closing labels, date format and text
   * direction of the preview and export. Optional: letters created without it
   * (older clients, mobile) have their language inferred by the web client.
   */
  @IsOptional()
  @IsIn(LETTER_LOCALES, { message: `letterLocale must be one of: ${LETTER_LOCALES.join(', ')}` })
  letterLocale?: LetterLocale;

  /** Mobile compatibility only (`apps/mobile/.../cover-letters/new.tsx`). Intentionally not persisted. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientTitle?: string;

  /** Mobile compatibility only (`apps/mobile/.../cover-letters/new.tsx`). Intentionally not persisted. */
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  content?: string;

  /** Mobile compatibility only (`apps/mobile/.../cover-letters/new.tsx`). Intentionally not persisted. */
  @IsOptional()
  @IsEnum(CoverLetterStatus, {
    message: `status must be one of: ${Object.values(CoverLetterStatus).join(', ')}`,
  })
  status?: CoverLetterStatus;

  /** Mobile compatibility only (`apps/mobile/.../cover-letters/new.tsx`). Intentionally not persisted. */
  @IsOptional()
  @IsBoolean()
  aiGenerated?: boolean;

  /** Mobile compatibility only (`apps/mobile/.../cover-letters/new.tsx`). Intentionally not persisted. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CoverLetterStylingDto)
  styling?: CoverLetterStylingDto;
}

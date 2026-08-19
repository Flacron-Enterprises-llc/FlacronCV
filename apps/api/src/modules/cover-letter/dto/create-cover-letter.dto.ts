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

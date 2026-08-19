import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateCVData, CVStatus } from '@flacroncv/shared-types';
import { PersonalInfoDto } from './personal-info.dto';
import { CvStylingDto } from './cv-styling.dto';

export class CreateCvDto implements CreateCVData {
  @IsString()
  @Matches(/\S/, { message: 'title is required' })
  @MaxLength(200)
  title!: string;

  @IsString()
  @Matches(/\S/, { message: 'templateId is required' })
  @MaxLength(100)
  templateId!: string;

  /** Mobile compatibility only (`apps/mobile/.../cvs/new.tsx`). Intentionally not persisted. */
  @IsOptional()
  @IsEnum(CVStatus, { message: `status must be one of: ${Object.values(CVStatus).join(', ')}` })
  status?: CVStatus;

  /** Mobile compatibility only (`apps/mobile/.../cvs/new.tsx`). Intentionally not persisted. */
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  /** Mobile compatibility only (`apps/mobile/.../cvs/new.tsx`). Intentionally not persisted. */
  @IsOptional()
  @ValidateNested()
  @Type(() => PersonalInfoDto)
  personalInfo?: PersonalInfoDto;

  /** Mobile compatibility only (`apps/mobile/.../cvs/new.tsx`). Intentionally not persisted. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CvStylingDto)
  styling?: CvStylingDto;

  /** Mobile compatibility only (`apps/mobile/.../cvs/new.tsx`). Intentionally not persisted. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  sectionOrder?: string[];
}

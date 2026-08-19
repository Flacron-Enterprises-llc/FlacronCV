import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CoverLetterStatus, UpdateCoverLetterData } from '@flacroncv/shared-types';
import { CoverLetterStylingDto } from './cover-letter-styling.dto';

export class UpdateCoverLetterDto implements UpdateCoverLetterData {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  companyAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  jobDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  templateId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoverLetterStylingDto)
  styling?: CoverLetterStylingDto;

  @IsOptional()
  @IsEnum(CoverLetterStatus, {
    message: `status must be one of: ${Object.values(CoverLetterStatus).join(', ')}`,
  })
  status?: CoverLetterStatus;
}

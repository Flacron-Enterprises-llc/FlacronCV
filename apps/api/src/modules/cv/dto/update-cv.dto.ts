import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CVStatus, UpdateCVData } from '@flacroncv/shared-types';
import { PersonalInfoDto } from './personal-info.dto';
import { CvStylingDto } from './cv-styling.dto';

export class UpdateCvDto implements UpdateCVData {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  templateId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PersonalInfoDto)
  personalInfo?: PersonalInfoDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  sectionOrder?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CvStylingDto)
  styling?: CvStylingDto;

  @IsOptional()
  @IsEnum(CVStatus, { message: `status must be one of: ${Object.values(CVStatus).join(', ')}` })
  status?: CVStatus;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

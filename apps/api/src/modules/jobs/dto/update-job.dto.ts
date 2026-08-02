import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { UpdateJobData, JobStatus } from '@flacroncv/shared-types';

export class UpdateJobDto implements UpdateJobData {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  jobUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @IsOptional()
  @IsEnum(JobStatus, { message: `status must be one of: ${Object.values(JobStatus).join(', ')}` })
  status?: JobStatus;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  appliedDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  linkedCVId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  linkedCoverLetterId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  salaryRange?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string | null;

  @IsOptional()
  @IsEmail({}, { message: 'contactEmail must be a valid email address' })
  @MaxLength(320)
  contactEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  interviewDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  followUpDate?: string | null;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

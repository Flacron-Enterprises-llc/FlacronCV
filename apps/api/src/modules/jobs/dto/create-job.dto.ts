import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { CreateJobData, JobStatus } from '@flacroncv/shared-types';

export class CreateJobDto implements CreateJobData {
  @IsString()
  @Matches(/\S/, { message: 'company is required' })
  @MaxLength(200)
  company!: string;

  @IsString()
  @Matches(/\S/, { message: 'position is required' })
  @MaxLength(200)
  position!: string;

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

  /** Free text — currencies and formats vary too much to constrain. */
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

  /** ISO date-time, e.g. 2026-08-03T14:30 (from an <input type=datetime-local>). */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  interviewDate?: string | null;

  /** ISO date, e.g. 2026-08-10. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  followUpDate?: string | null;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

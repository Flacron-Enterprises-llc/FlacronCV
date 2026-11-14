import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  CreateJobData,
  JOB_LIMITS,
  JOB_OUTCOMES,
  JOB_STATUS_INPUTS,
  JobDescriptionSource,
  JobOutcome,
  JobStatus,
  LegacyJobStatus,
} from '@flacroncv/shared-types';
import { JobChecklistItemDto, JobContactDto, JobFormAnswerDto } from './job-parts.dto';

/** Calendar date as an <input type=date> produces it. */
export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

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

  /** Legacy values (wishlist/offer/accepted) from older apps are accepted and normalised by the service. */
  @IsOptional()
  @IsIn(JOB_STATUS_INPUTS, { message: `status must be one of: ${JOB_STATUS_INPUTS.join(', ')}` })
  status?: JobStatus | LegacyJobStatus;

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

  /** @deprecated Old single contact (apps from before `contacts`). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string | null;

  /** @deprecated Old single contact (apps from before `contacts`). */
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

  /** ISO date the application closes. New field, so its format is enforced. */
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'deadline must be a date (YYYY-MM-DD)' })
  deadline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(JOB_LIMITS.descriptionChars)
  jobDescription?: string | null;

  @IsOptional()
  @IsIn(['pasted', 'opportunity'])
  jobDescriptionSource?: JobDescriptionSource | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(JOB_LIMITS.contacts)
  @ValidateNested({ each: true })
  @Type(() => JobContactDto)
  contacts?: JobContactDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(JOB_LIMITS.checklistItems)
  @ValidateNested({ each: true })
  @Type(() => JobChecklistItemDto)
  checklist?: JobChecklistItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(JOB_LIMITS.formAnswers)
  @ValidateNested({ each: true })
  @Type(() => JobFormAnswerDto)
  formAnswers?: JobFormAnswerDto[];

  /** User-reported outcome; the origin is always recorded server-side as user_reported. */
  @IsOptional()
  @IsIn(JOB_OUTCOMES)
  outcome?: JobOutcome | null;

  @IsOptional()
  @IsString()
  @MaxLength(JOB_LIMITS.opportunityId)
  opportunityId?: string | null;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

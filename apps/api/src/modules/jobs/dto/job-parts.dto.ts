import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  JOB_LIMITS,
  JobChecklistItemInput,
  JobChecklistKind,
  JobContactInput,
  JobFormAnswerInput,
} from '@flacroncv/shared-types';

/** One application contact. An empty string is treated like null (cleared). */
export class JobContactDto implements JobContactInput {
  @IsOptional()
  @IsString()
  @MaxLength(JOB_LIMITS.itemId)
  id?: string;

  @IsString()
  @MaxLength(JOB_LIMITS.contactName)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(JOB_LIMITS.contactRole)
  role?: string | null;

  // Validate the format only when something was typed; '' means "no email".
  @IsOptional()
  @ValidateIf((_o, value) => typeof value === 'string' && value.trim().length > 0)
  @IsEmail({}, { message: 'contacts.email must be a valid email address' })
  @MaxLength(JOB_LIMITS.contactEmail)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(JOB_LIMITS.contactPhone)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(JOB_LIMITS.contactNotes)
  notes?: string | null;
}

export class JobChecklistItemDto implements JobChecklistItemInput {
  @IsOptional()
  @IsString()
  @MaxLength(JOB_LIMITS.itemId)
  id?: string;

  @IsString()
  @MaxLength(JOB_LIMITS.checklistLabel)
  label!: string;

  @IsOptional()
  @IsIn(['document', 'task'])
  kind?: JobChecklistKind;

  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

export class JobFormAnswerDto implements JobFormAnswerInput {
  @IsOptional()
  @IsString()
  @MaxLength(JOB_LIMITS.itemId)
  id?: string;

  @IsString()
  @MaxLength(JOB_LIMITS.question)
  question!: string;

  @IsString()
  @MaxLength(JOB_LIMITS.answer)
  answer!: string;
}

/** Body of POST /jobs/:id/refreeze — which linked document to freeze again at its current state. */
export class RefreezeJobDocumentDto {
  @IsIn(['cv', 'cover_letter'])
  kind!: 'cv' | 'cover_letter';
}

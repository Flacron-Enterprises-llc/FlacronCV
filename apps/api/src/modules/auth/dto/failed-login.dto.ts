import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Payload for reporting a failed sign-in to the audit trail.
 *
 * Deliberately minimal: an address and a coarse reason code. There is no field
 * for the attempted password and there must never be one — the audit log is
 * readable by admins.
 */
export class FailedLoginDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  /** Firebase error code, e.g. `auth/wrong-password`. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  reason?: string;
}

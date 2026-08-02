import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLeadDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  /** Which form / lead magnet / page captured this lead. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  source!: string;

  /** Must be true — the service rejects false (consent is never pre-selected). */
  @IsBoolean()
  consent!: boolean;

  /** The exact consent copy the user saw (stored for GDPR proof). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  consentText!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  consentVersion!: string;
}

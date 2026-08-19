import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PersonalInfo } from '@flacroncv/shared-types';

/**
 * Nested write shape for `personalInfo`. Extra keys are rejected by the global
 * pipe (`forbidNonWhitelisted`) so dotted Firestore writes cannot invent fields.
 * Every property is optional — autosave and mobile create send partial objects.
 */
export class PersonalInfoDto implements Partial<PersonalInfo> {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  linkedin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  github?: string;

  /** Empty string or https URL; `null` clears. Service enforces https when set. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  photoURL?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  summary?: string;
}

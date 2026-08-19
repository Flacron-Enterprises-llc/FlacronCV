import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Locale, Theme, UpdateUserData, UserPreferences, UserProfile } from '@flacroncv/shared-types';

export class UserProfileDto implements Partial<UserProfile> {
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
  @MaxLength(200)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

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
}

export class UserPreferencesDto implements Partial<UserPreferences> {
  @IsOptional()
  @IsEnum(Locale, { message: `language must be one of: ${Object.values(Locale).join(', ')}` })
  language?: Locale;

  @IsOptional()
  @IsEnum(Theme, { message: `theme must be one of: ${Object.values(Theme).join(', ')}` })
  theme?: Theme;

  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  marketingEmails?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  defaultCVTemplate?: string;
}

export class UpdateUserDto implements UpdateUserData {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  photoURL?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => UserProfileDto)
  profile?: UserProfileDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UserPreferencesDto)
  preferences?: UserPreferencesDto;
}

/** Body of PATCH /users/me/preferences — the preference object itself, not wrapped. */
export class UpdatePreferencesDto extends UserPreferencesDto {}

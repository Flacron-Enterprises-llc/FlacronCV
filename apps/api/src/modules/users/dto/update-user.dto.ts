import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AppTourPreference,
  AppTourStatus,
  Locale,
  Theme,
  UpdateUserData,
  UserPreferences,
  UserProfile,
} from '@flacroncv/shared-types';

export class UserProfileDto implements Partial<UserProfile> {
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'firstName must not be blank.' })
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'lastName must not be blank.' })
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

const APP_TOUR_STATUSES: AppTourStatus[] = ['unseen', 'in_progress', 'skipped', 'completed'];

export class AppTourPreferenceDto implements AppTourPreference {
  @IsInt()
  @Min(1)
  @Max(1000)
  version!: number;

  @IsIn(APP_TOUR_STATUSES)
  status!: AppTourStatus;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9-]+$/)
  stepId!: string | null;

  @IsOptional()
  @IsISO8601()
  completedAt!: string | null;

  @IsOptional()
  @IsISO8601()
  skippedAt!: string | null;

  @IsOptional()
  @IsISO8601()
  updatedAt!: string | null;
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
  @IsBoolean()
  pushNotifications?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  defaultCVTemplate?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AppTourPreferenceDto)
  appTour?: AppTourPreferenceDto;
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

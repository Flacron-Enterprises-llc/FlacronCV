import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { SubscriptionPlan, TemplateCategory } from '@flacroncv/shared-types';

const UPDATABLE_TEMPLATE_FIELDS = [
  'name',
  'slug',
  'description',
  'category',
  'thumbnailURL',
  'previewImages',
  'htmlTemplate',
  'cssTemplate',
  'supportedSections',
  'colorSchemes',
  'fontOptions',
  'tier',
  'isActive',
  'isFeatured',
  'nameLocalized',
  'descriptionLocalized',
] as const;

export type UpdatableTemplateField = (typeof UPDATABLE_TEMPLATE_FIELDS)[number];

export const TEMPLATE_UPDATABLE_FIELDS: readonly UpdatableTemplateField[] = UPDATABLE_TEMPLATE_FIELDS;

export class CreateTemplateDto {
  @IsString()
  @Matches(/\S/, { message: 'name is required' })
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(TemplateCategory, {
    message: `category must be one of: ${Object.values(TemplateCategory).join(', ')}`,
  })
  category?: TemplateCategory;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  thumbnailURL?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  previewImages?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200000)
  htmlTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200000)
  cssTemplate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportedSections?: string[];

  @IsOptional()
  @IsArray()
  colorSchemes?: unknown[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fontOptions?: string[];

  @IsOptional()
  @IsEnum(SubscriptionPlan, {
    message: `tier must be one of: ${Object.values(SubscriptionPlan).join(', ')}`,
  })
  tier?: SubscriptionPlan;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsObject()
  nameLocalized?: Record<string, string>;

  @IsOptional()
  @IsObject()
  descriptionLocalized?: Record<string, string>;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(TemplateCategory, {
    message: `category must be one of: ${Object.values(TemplateCategory).join(', ')}`,
  })
  category?: TemplateCategory;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  thumbnailURL?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  previewImages?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200000)
  htmlTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200000)
  cssTemplate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supportedSections?: string[];

  @IsOptional()
  @IsArray()
  colorSchemes?: unknown[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fontOptions?: string[];

  @IsOptional()
  @IsEnum(SubscriptionPlan, {
    message: `tier must be one of: ${Object.values(SubscriptionPlan).join(', ')}`,
  })
  tier?: SubscriptionPlan;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsObject()
  nameLocalized?: Record<string, string>;

  @IsOptional()
  @IsObject()
  descriptionLocalized?: Record<string, string>;
}

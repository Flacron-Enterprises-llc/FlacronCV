import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CVSectionType } from '@flacroncv/shared-types';
import { IsLooseSectionItemArray } from './is-loose-section-items';

export class AddSectionDto {
  /** Client-provided so the editor's sectionOrder stays consistent. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  id?: string;

  @IsEnum(CVSectionType, {
    message: `type must be one of: ${Object.values(CVSectionType).join(', ')}`,
  })
  type!: CVSectionType;

  @IsString()
  @Matches(/\S/, { message: 'title is required' })
  @MaxLength(200)
  title!: string;

  @IsInt()
  @Min(0)
  @Max(1000)
  order!: number;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  // Keep items as plain objects. enableImplicitConversion would otherwise
  // coerce each object into an Array and the loose-item check would 400.
  @Type(() => Object)
  @IsLooseSectionItemArray()
  items?: Record<string, unknown>[];
}

export class UpdateSectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @Type(() => Object)
  @IsLooseSectionItemArray()
  items?: Record<string, unknown>[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  order?: number;
}

export class ReorderSectionsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  sectionOrder!: string[];
}

export class CreateVersionDto {
  @IsString()
  @Matches(/\S/, { message: 'description is required' })
  @MaxLength(500)
  description!: string;
}

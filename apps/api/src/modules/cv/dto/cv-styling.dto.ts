import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CVStyling, FontSize, Spacing } from '@flacroncv/shared-types';

const CV_LAYOUTS = ['classic', 'sidebar', 'top-bar', 'compact', 'slate-gold'] as const;
const SECTION_STYLES = ['underline', 'card', 'left-border', 'minimal'] as const;
const BORDER_RADII = ['none', 'small', 'medium', 'large'] as const;

/**
 * Nested write shape for `styling`. Extra keys rejected. All optional so a
 * mobile create payload (subset) and a web autosave (full object) both pass.
 */
export class CvStylingDto implements Partial<CVStyling> {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fontFamily?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  headingFontFamily?: string;

  @IsOptional()
  @IsEnum(FontSize, { message: `fontSize must be one of: ${Object.values(FontSize).join(', ')}` })
  fontSize?: FontSize;

  @IsOptional()
  @IsEnum(Spacing, { message: `spacing must be one of: ${Object.values(Spacing).join(', ')}` })
  spacing?: Spacing;

  @IsOptional()
  @IsBoolean()
  showPhoto?: boolean;

  @IsOptional()
  @IsIn(CV_LAYOUTS, { message: `layout must be one of: ${CV_LAYOUTS.join(', ')}` })
  layout?: CVStyling['layout'];

  @IsOptional()
  @IsIn(SECTION_STYLES, { message: `sectionStyle must be one of: ${SECTION_STYLES.join(', ')}` })
  sectionStyle?: CVStyling['sectionStyle'];

  @IsOptional()
  @IsIn(BORDER_RADII, { message: `borderRadius must be one of: ${BORDER_RADII.join(', ')}` })
  borderRadius?: CVStyling['borderRadius'];
}

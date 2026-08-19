import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CoverLetterStyling } from '@flacroncv/shared-types';

export class CoverLetterStylingDto implements Partial<CoverLetterStyling> {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fontFamily?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  fontSize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  senderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  senderEmail?: string;
}

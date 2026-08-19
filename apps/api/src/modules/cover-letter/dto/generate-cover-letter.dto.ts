import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { GenerateCoverLetterData } from '@flacroncv/shared-types';

const TONES = ['professional', 'friendly', 'enthusiastic', 'formal'] as const;

export class GenerateCoverLetterDto implements GenerateCoverLetterData {
  @IsString()
  @MaxLength(200)
  jobTitle!: string;

  @IsString()
  @MaxLength(20000)
  jobDescription!: string;

  @IsString()
  @MaxLength(200)
  companyName!: string;

  @IsIn(TONES, { message: `tone must be one of: ${TONES.join(', ')}` })
  tone!: (typeof TONES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  linkedCVId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ImportCvDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsString()
  @Matches(/\S/, { message: 'resumeText is required' })
  @MaxLength(100000)
  resumeText!: string;
}

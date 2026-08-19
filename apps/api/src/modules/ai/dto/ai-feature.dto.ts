import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ImproveSectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  sectionType!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

export class TranslateContentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  content!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  targetLanguage!: string;
}

export class GenerateCvSummaryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  experience!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  skills!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  targetRole!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

export class SuggestSkillsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  experience!: string;

  @IsString()
  @MaxLength(8000)
  currentSkills!: string;
}

export class GenerateJobDescriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  jobTitle!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

export class GenerateAiCoverLetterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  jobTitle!: string;

  @IsString()
  @MaxLength(20000)
  jobDescription!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  companyName!: string;

  @IsString()
  @MaxLength(50000)
  candidateSummary!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  tone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  length?: string;
}

export class AtsCheckDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  cvContent!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  jobDescription!: string;
}

export class InterviewPrepDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  jobDescription!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  cvContent?: string;
}

export class LinkedinOptimizeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  cvContent!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  targetRole?: string;
}

import { IsString, IsNotEmpty, MaxLength, IsOptional, IsInt, Min, Max, IsNumber } from 'class-validator';

/**
 * The raw /ai/generate endpoint is the only one that lets the caller set
 * generation params, so it is the one that needs an actual class-validator DTO
 * (an inline interface is erased at runtime → the global ValidationPipe can't
 * validate it). Bounds mirror the server-side clamp in AIService as defense in
 * depth; `model` is deliberately absent so a caller can't switch to a pricier
 * model (forbidNonWhitelisted rejects it).
 */
export class GenerateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  prompt!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2048)
  maxTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;
}

import { IsString, Matches, MaxLength } from 'class-validator';

export class AddMessageDto {
  @IsString()
  @Matches(/\S/, { message: 'content is required' })
  @MaxLength(5000, { message: 'content must be at most 5000 characters' })
  content!: string;
}

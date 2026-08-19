import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ContactMessageDto {
  @IsString()
  @Matches(/\S/, { message: 'name is required' })
  @MaxLength(100)
  name!: string;

  @IsEmail({}, { message: 'A valid email address is required.' })
  @MaxLength(320)
  email!: string;

  @IsString()
  @Matches(/\S/, { message: 'subject is required' })
  @MaxLength(200)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsString()
  @Matches(/\S/, { message: 'message is required' })
  @MaxLength(5000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  accountEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  plan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  timestamp?: string;
}

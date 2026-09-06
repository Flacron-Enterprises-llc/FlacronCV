import { IsString, MaxLength } from 'class-validator';

export class AppleNotificationDto {
  @IsString()
  @MaxLength(50000)
  signedPayload!: string;
}

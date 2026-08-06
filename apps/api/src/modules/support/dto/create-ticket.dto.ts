import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CreateTicketData, TicketCategory, TicketPriority } from '@flacroncv/shared-types';

export class CreateTicketDto implements CreateTicketData {
  @IsString()
  @Matches(/\S/, { message: 'subject is required' })
  @MaxLength(200, { message: 'subject must be at most 200 characters' })
  subject!: string;

  @IsEnum(TicketCategory, {
    message: `category must be one of: ${Object.values(TicketCategory).join(', ')}`,
  })
  category!: TicketCategory;

  @IsOptional()
  @IsEnum(TicketPriority, {
    message: `priority must be one of: ${Object.values(TicketPriority).join(', ')}`,
  })
  priority?: TicketPriority;

  @IsString()
  @Matches(/\S/, { message: 'message is required' })
  @MaxLength(5000, { message: 'message must be at most 5000 characters' })
  message!: string;
}

import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TicketPriority, TicketStatus } from '@flacroncv/shared-types';

export class UpdateTicketDto {
  @IsOptional()
  @IsEnum(TicketStatus, {
    message: `status must be one of: ${Object.values(TicketStatus).join(', ')}`,
  })
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority, {
    message: `priority must be one of: ${Object.values(TicketPriority).join(', ')}`,
  })
  priority?: TicketPriority;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  assignedTo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  assignedToName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  resolvedAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  closedAt?: string | null;
}

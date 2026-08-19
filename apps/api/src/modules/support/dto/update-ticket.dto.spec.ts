import { BadRequestException } from '@nestjs/common';
import { TicketStatus } from '@flacroncv/shared-types';
import { transformBody } from '../../../common/test/app-validation-pipe';
import { UpdateTicketDto } from './update-ticket.dto';

describe('UpdateTicketDto (ValidationPipe)', () => {
  it('accepts a status-only admin patch', async () => {
    const result = await transformBody(UpdateTicketDto, { status: TicketStatus.IN_PROGRESS });
    expect(result.status).toBe(TicketStatus.IN_PROGRESS);
  });

  it('rejects unknown fields and a bad status', async () => {
    await expect(transformBody(UpdateTicketDto, { status: TicketStatus.OPEN, userId: 'other' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(transformBody(UpdateTicketDto, { status: 'nope' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

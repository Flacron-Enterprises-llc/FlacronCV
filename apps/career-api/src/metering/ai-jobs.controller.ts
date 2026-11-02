import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { MeteringService } from '@flacroncv/career-server';
import type { Principal } from '@flacroncv/career-server';
import { CurrentPrincipal } from '../auth/auth.guard';

/**
 * API_CONTRACT "Jobs". `succeeded` means the reservation is committed.
 * `failed` with ledger state `released` is the only case the client may
 * call "no credit used"; `failed` with `reserved` is "not confirmed".
 */
@Controller('ai-jobs')
export class AiJobsController {
  constructor(private readonly metering: MeteringService) {}

  @Get(':jobId')
  async job(@CurrentPrincipal() principal: Principal, @Param('jobId', new ParseUUIDPipe()) jobId: string) {
    const job = await this.metering.job(principal.billingAccountId, jobId);
    return { id: job.id, status: job.status, state: job.ledgerState };
  }
}

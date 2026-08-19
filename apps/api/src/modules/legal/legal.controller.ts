import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LegalAcceptance } from '@flacroncv/shared-types';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser, FirebaseUser } from '../../common/decorators/current-user.decorator';
import { RecordLegalAcceptanceDto } from './dto/record-legal-acceptance.dto';
import { LegalAcceptanceService } from './legal-acceptance.service';

@ApiTags('legal')
@Controller('legal')
@UseGuards(FirebaseAuthGuard)
@ApiBearerAuth()
export class LegalController {
  constructor(private readonly legalAcceptance: LegalAcceptanceService) {}

  /**
   * Stamp (or overwrite) this token's legal-acceptance snapshot.
   *
   * uid and email come from the verified token — never from the body. A
   * moderate throttle sits on top of the global one so a retrying client is
   * not 429'd off the signup path.
   */
  @Post('acceptances')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  record(
    @CurrentUser() user: FirebaseUser,
    @Body() dto: RecordLegalAcceptanceDto,
  ): Promise<LegalAcceptance> {
    return this.legalAcceptance.record(user.uid, user.email ?? '', dto);
  }

  /**
   * Own row, or null. Missing is not an error — grandfathered accounts have
   * no document and must not be locked out by a 404.
   */
  @Get('acceptances/me')
  async mine(@CurrentUser() user: FirebaseUser): Promise<{ acceptance: LegalAcceptance | null }> {
    return { acceptance: await this.legalAcceptance.findByUid(user.uid) };
  }
}

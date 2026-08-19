import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller';
import { LegalAcceptanceService } from './legal-acceptance.service';

@Module({
  controllers: [LegalController],
  providers: [LegalAcceptanceService],
  exports: [LegalAcceptanceService],
})
export class LegalModule {}

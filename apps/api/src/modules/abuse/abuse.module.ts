import { Module } from '@nestjs/common';
import { AbuseService } from './abuse.service';

@Module({
  providers: [AbuseService],
  exports: [AbuseService],
})
export class AbuseModule {}

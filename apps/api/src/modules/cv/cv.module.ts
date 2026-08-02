import { Module } from '@nestjs/common';
import { CVController } from './cv.controller';
import { CVService } from './cv.service';
import { UsersModule } from '../users/users.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [UsersModule, AIModule],
  controllers: [CVController],
  providers: [CVService],
  exports: [CVService],
})
export class CVModule {}

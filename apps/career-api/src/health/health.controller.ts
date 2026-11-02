import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/auth.guard';
import { DatabaseService } from '../database/database.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await this.database.selectOne();
    } catch {
      throw new ServiceUnavailableException({ code: 'database_unavailable' });
    }
    return { status: 'ok' };
  }
}

import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL?.trim() ?? '';
    if (connectionString.length === 0) {
      throw new Error('Missing required environment variable: DATABASE_URL');
    }
    this.pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
    this.pool.on('error', () => {
      console.error('Database pool reported an idle client error');
    });
  }

  /** For the billing services, which run their own transactions. */
  get connectionPool(): Pool {
    return this.pool;
  }

  async selectOne(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

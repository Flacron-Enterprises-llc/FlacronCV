import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { loadRepoEnv } from '@flacroncv/career-server';
import { AppModule } from './app.module';
import { APP_OPTIONS, configureApp } from './configure-app';
import { readAppConfig } from './config/env';

async function bootstrap() {
  loadRepoEnv(__dirname);

  let config: ReturnType<typeof readAppConfig>;
  try {
    config = readAppConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Startup failed';
    console.error(message);
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, APP_OPTIONS);
  app.enableShutdownHooks();
  configureApp(app, config);

  await app.listen(config.port);
  console.log(`FlacronCV API listening on port ${config.port}`);
}

void bootstrap();

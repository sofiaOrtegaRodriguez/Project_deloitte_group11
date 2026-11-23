import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadEnv } from './config/env';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  loadEnv();
  const app = configureApp(await NestFactory.create(AppModule));
  const port = Number(process.env.BACKEND_PORT ?? 3001);
  await app.listen(port);
  console.log(`Hosstock backend listening on http://localhost:${port}/api`);
}

void bootstrap();

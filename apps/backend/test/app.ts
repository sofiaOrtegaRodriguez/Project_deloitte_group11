import 'reflect-metadata';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

/** Builds the real app exactly as main.ts does, optionally with extra test-only controllers. */
export async function createTestApp(
  extraControllers: Type<unknown>[] = [],
): Promise<{ app: INestApplication; prisma: PrismaService }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: extraControllers }).compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

/** The Director credentials set in setup-env.ts. */
export const DIRECTOR = { email: 'director@hospital.test', password: 'director-password', name: 'Test Director' };

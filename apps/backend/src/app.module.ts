import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.service';
import { DirectorSeed } from './users/director-seed';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [HealthController],
  providers: [DirectorSeed],
})
export class AppModule {}

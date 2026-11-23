import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ExampleSecretsCheck } from './config/example-secrets';
import { HealthController } from './health/health.controller';
import { ItemsModule } from './items/items.module';
import { PlanningModule } from './planning/planning.module';
import { PrismaModule } from './prisma/prisma.service';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { DirectorSeed } from './users/director-seed';
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, AuthModule, ItemsModule, UsersModule, PlanningModule, RecommendationsModule],
  controllers: [HealthController],
  // ExampleSecretsCheck runs on module init, before DirectorSeed (application bootstrap).
  providers: [ExampleSecretsCheck, DirectorSeed],
})
export class AppModule {}

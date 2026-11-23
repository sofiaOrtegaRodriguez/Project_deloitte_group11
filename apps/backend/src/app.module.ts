import { Module } from '@nestjs/common';
import { AlertsModule } from './alerts/alerts.module';
import { AuthModule } from './auth/auth.module';
import { ExampleSecretsCheck } from './config/example-secrets';
import { HealthController } from './health/health.controller';
import { ItemsModule } from './items/items.module';
import { PrismaModule } from './prisma/prisma.service';
import { DirectorSeed } from './users/director-seed';
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, AuthModule, ItemsModule, AlertsModule, UsersModule],
  controllers: [HealthController],
  // ExampleSecretsCheck runs on module init, before DirectorSeed (application bootstrap).
  providers: [ExampleSecretsCheck, DirectorSeed],
})
export class AppModule {}

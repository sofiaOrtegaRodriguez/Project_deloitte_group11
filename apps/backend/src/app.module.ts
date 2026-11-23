import { Module } from '@nestjs/common';
import { AlertsModule } from './alerts/alerts.module';
import { AuthModule } from './auth/auth.module';
import { ClockModule } from './clock/clock';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExampleSecretsCheck } from './config/example-secrets';
import { FiltersModule } from './filters/filters.module';
import { HealthController } from './health/health.controller';
import { ItemsModule } from './items/items.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlanningModule } from './planning/planning.module';
import { PrismaModule } from './prisma/prisma.service';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { RemindersModule } from './reminders/reminders';
import { SettingsModule } from './settings/settings';
import { SimulationModule } from './simulation/simulation';
import { DirectorSeed } from './users/director-seed';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    PrismaModule,
    ClockModule,
    AuthModule,
    ItemsModule,
    AlertsModule,
    DashboardModule,
    FiltersModule,
    UsersModule,
    SettingsModule,
    SimulationModule,
    PlanningModule,
    RecommendationsModule,
    NotificationsModule,
    RemindersModule,
  ],
  controllers: [HealthController],
  // ExampleSecretsCheck runs on module init, before DirectorSeed (application bootstrap).
  providers: [ExampleSecretsCheck, DirectorSeed],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({ imports: [AlertsModule], controllers: [RecommendationsController], providers: [RecommendationsService] })
export class RecommendationsModule {}

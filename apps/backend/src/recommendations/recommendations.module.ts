import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [AlertsModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
  // Exported so other modules (exports, PDF report) reuse this instance instead of building their own.
  exports: [RecommendationsService],
})
export class RecommendationsModule {}

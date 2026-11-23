import { AlertsWidget } from '@/components/alerts/alerts-widget';
import { PagePlaceholder } from '@/components/page-placeholder';

export default function DashboardPage() {
  return (
    <div className="space-y-5">
      <PagePlaceholder
        title="Dashboard"
        description="KPIs, Urgency Levels, the Priority Score ranking and Alerts at a glance."
      />
      <AlertsWidget />
    </div>
  );
}

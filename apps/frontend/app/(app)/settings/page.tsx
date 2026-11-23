import { PagePlaceholder } from '@/components/page-placeholder';
import { ChangePasswordSection } from '@/components/change-password-section';
import { TeamMembersSection } from '@/components/team-members-section';
import { UsersSection } from '@/components/users-section';

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PagePlaceholder
        title="Settings"
        description="Configuration, Threshold Overrides, Simulation and logs."
      />
      <UsersSection />
      <TeamMembersSection />
      <ChangePasswordSection />
    </div>
  );
}

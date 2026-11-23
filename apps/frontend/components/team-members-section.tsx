'use client';

import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/lib/auth';
import { useRemoveRestore, useUserManagementLog, useUsers, type LogAction } from '@/lib/users';

const ACTION_LABELS: Record<LogAction, string> = {
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  REMOVE: 'Removed',
  RESTORE: 'Restored',
};

/** Active and Removed Procurement Team members, with Remove and Restore. */
function TeamMembers() {
  const { data: users, isPending, error } = useUsers(['ACTIVE', 'REMOVED']);
  const change = useRemoveRestore();
  const members = users?.filter((u) => u.role === 'PROCUREMENT_TEAM');

  return (
    <section className="space-y-2">
      <h3 className="font-medium">Procurement Team</h3>
      {isPending && <p className="text-muted-foreground">Loading…</p>}
      {error && <p role="alert" className="text-destructive">{error.message}</p>}
      {change.error && <p role="alert" className="text-destructive">{change.error.message}</p>}
      {members?.length === 0 && <p className="text-muted-foreground">No Procurement Team members yet.</p>}
      {members && members.length > 0 && (
        <ul className="divide-y rounded-md border bg-background">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="leading-tight">
                <div className="font-medium">{member.name}</div>
                <div className="text-xs text-muted-foreground">
                  {member.email}
                  {member.status === 'REMOVED' && ' · Removed'}
                </div>
              </div>
              {member.status === 'ACTIVE' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={change.isPending}
                  onClick={() => change.mutate({ id: member.id, action: 'remove' })}
                >
                  Remove
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={change.isPending}
                  onClick={() => change.mutate({ id: member.id, action: 'restore' })}
                >
                  Restore
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The User Management Log: every approve, reject, remove and restore decision. */
function UserManagementLog() {
  const { data: entries, isPending, error } = useUserManagementLog();
  return (
    <section className="space-y-2">
      <h3 className="font-medium">User Management Log</h3>
      {isPending && <p className="text-muted-foreground">Loading…</p>}
      {error && <p role="alert" className="text-destructive">{error.message}</p>}
      {entries?.length === 0 && <p className="text-muted-foreground">No decisions yet.</p>}
      {entries && entries.length > 0 && (
        <table className="w-full rounded-md border bg-background text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">By</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-3 py-2">{new Date(entry.date).toLocaleString()}</td>
                <td className="px-3 py-2">{ACTION_LABELS[entry.action]}</td>
                <td className="px-3 py-2">
                  {entry.affectedUser.name} <span className="text-xs text-muted-foreground">{entry.affectedUser.email}</span>
                </td>
                <td className="px-3 py-2">{entry.actor?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Settings → team management and log. Director only: renders nothing for anyone else. */
export function TeamMembersSection() {
  const { data: user } = useCurrentUser();
  if (user?.role !== 'DIRECTOR') return null;
  return (
    <div className="space-y-4">
      <TeamMembers />
      <UserManagementLog />
    </div>
  );
}

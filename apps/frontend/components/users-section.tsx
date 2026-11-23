'use client';

import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/lib/auth';
import { useDecideRequest, useUsers } from '@/lib/users';

/** Access Requests waiting for the Director. */
function AccessRequests() {
  const { data: requests, isPending, error } = useUsers(['PENDING']);
  const decide = useDecideRequest();

  return (
    <section className="space-y-2">
      <h3 className="font-medium">Access Requests</h3>
      {isPending && <p className="text-muted-foreground">Loading…</p>}
      {error && <p role="alert" className="text-destructive">{error.message}</p>}
      {decide.error && <p role="alert" className="text-destructive">{decide.error.message}</p>}
      {requests?.length === 0 && <p className="text-muted-foreground">No pending Access Requests.</p>}
      {requests && requests.length > 0 && (
        <ul className="divide-y rounded-md border bg-background">
          {requests.map((request) => (
            <li key={request.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="leading-tight">
                <div className="font-medium">{request.name}</div>
                <div className="text-xs text-muted-foreground">{request.email}</div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: request.id, decision: 'approve' })}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: request.id, decision: 'reject' })}
                >
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Settings → Users. Director only: renders nothing for anyone else.
 * Later tickets add more sections here (Users list with Remove/Restore, change log).
 */
export function UsersSection() {
  const { data: user } = useCurrentUser();
  if (user?.role !== 'DIRECTOR') return null;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Users</h2>
      <AccessRequests />
    </div>
  );
}

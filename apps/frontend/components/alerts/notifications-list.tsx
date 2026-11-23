'use client';

import { Button } from '@/components/ui/button';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/lib/notifications';

/** The User's own Notifications inbox, newest first, with mark-as-read. */
export function NotificationsList() {
  const { data, isLoading, isError } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  if (isLoading) return <p className="p-3 text-sm text-muted-foreground">Loading notifications...</p>;
  if (isError || !data) return <p className="p-3 text-sm text-destructive">Could not load notifications.</p>;
  if (data.notifications.length === 0) return <p className="p-3 text-sm text-muted-foreground">No notifications.</p>;

  return (
    <div>
      <div className="flex justify-end border-b px-3 py-1">
        <Button variant="ghost" size="sm" disabled={data.unreadCount === 0 || markAll.isPending} onClick={() => markAll.mutate()}>
          Mark all as read
        </Button>
      </div>
      <ul>
        {data.notifications.map((n) => (
          <li key={n.id} className="flex items-start justify-between gap-2 border-b px-3 py-2 text-sm last:border-b-0">
            <div className={n.readAt ? 'text-muted-foreground' : 'font-medium'}>
              <p>{n.message}</p>
              <p className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
            </div>
            {!n.readAt && (
              <Button variant="ghost" size="sm" disabled={markRead.isPending} onClick={() => markRead.mutate(n.id)}>
                Mark as read
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

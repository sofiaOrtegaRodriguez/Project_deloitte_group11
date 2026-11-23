'use client';

import { BellRing, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNotifications, type AppNotification } from '@/lib/notifications';

/** How long a Reminder toast stays on screen. */
const TOAST_MS = 10_000;

/**
 * Shows a toast for every NEW Reminder Notification, on whatever page the User is. The first load only records
 * the highest Notification id already there, so reloading the page never re-toasts old Reminders.
 */
export function ReminderToasts() {
  const { data } = useNotifications();
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const highestSeen = useRef<number | null>(null);

  useEffect(() => {
    if (!data) return;
    const highest = data.notifications.reduce((max, n) => Math.max(max, n.id), 0);
    if (highestSeen.current === null) {
      highestSeen.current = highest;
      return;
    }
    const fresh = data.notifications.filter((n) => n.type === 'REMINDER' && n.id > highestSeen.current!);
    highestSeen.current = Math.max(highestSeen.current, highest);
    if (fresh.length === 0) return;
    setToasts((current) => [...current, ...fresh.reverse()]);
    const ids = new Set(fresh.map((n) => n.id));
    setTimeout(() => setToasts((current) => current.filter((t) => !ids.has(t.id))), TOAST_MS);
  }, [data]);

  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2" role="region" aria-label="Reminders">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-auto flex items-start gap-2 rounded-md border bg-background p-3 text-sm shadow-lg"
        >
          <BellRing className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p className="min-w-0 flex-1">{toast.message}</p>
          <button
            type="button"
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

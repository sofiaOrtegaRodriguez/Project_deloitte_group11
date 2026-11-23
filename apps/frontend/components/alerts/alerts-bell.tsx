'use client';

import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/lib/notifications';
import { AlertsList } from './alerts-list';
import { NotificationsList } from './notifications-list';

/**
 * The bell in the app header. Opens the Alerts panel. Kept separate so the unread-count badge and
 * Notifications (ticket 12) can be added without touching the panel.
 */
export function AlertsBell() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'alerts' | 'notifications'>('alerts');
  const unread = useNotifications().data?.unreadCount ?? 0;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="sm" aria-label="Alerts" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Bell className="size-4" aria-hidden />
        {unread > 0 && (
          <span
            aria-label={`${unread} unread notifications`}
            className="ml-1 min-w-5 rounded-full bg-destructive px-1 text-xs text-white"
          >
            {unread}
          </span>
        )}
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Alerts"
          className="absolute right-0 top-full z-20 mt-1 w-96 max-w-[90vw] rounded-md border bg-background shadow-lg"
        >
          <div role="tablist" className="flex border-b">
            {(['alerts', 'notifications'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 font-semibold ${tab === t ? 'border-b-2 border-foreground' : 'text-muted-foreground'}`}
              >
                {t === 'alerts' ? 'Alerts' : `Notifications${unread > 0 ? ` (${unread})` : ''}`}
              </button>
            ))}
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {tab === 'alerts' ? <AlertsList /> : <NotificationsList />}
          </div>
        </div>
      )}
    </div>
  );
}

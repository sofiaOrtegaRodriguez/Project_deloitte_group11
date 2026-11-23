'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  LEVEL_LABELS,
  MANUAL_STATUSES,
  STATUS_LABELS,
  useAlertDetail,
  useChangeAlertStatus,
  useCommentOnAlert,
  type AlertDetail,
  type AlertEvent,
  type AlertSummary,
} from '@/lib/alerts';
import { cn } from '@/lib/utils';

const dateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** Red for Critical, amber for Attention: the colours reserved for Urgency Levels. */
export function LevelBadge({ level }: { level: AlertSummary['level'] }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-semibold',
        level === 'CRITICAL' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800',
      )}
    >
      {LEVEL_LABELS[level]}
    </span>
  );
}

function describe(event: AlertEvent): string {
  const label = (s: AlertEvent['toStatus']) => (s ? STATUS_LABELS[s] : '');
  switch (event.type) {
    case 'CREATED':
      return 'Alert created';
    case 'ESCALATED':
      return `Escalated to ${event.toLevel ? LEVEL_LABELS[event.toLevel] : ''}, back to New`;
    case 'LEVEL_LOWERED':
      return `Level lowered to ${event.toLevel ? LEVEL_LABELS[event.toLevel] : ''}`;
    case 'REOPENED':
      return 'Reopened, back to New';
    case 'CLEARED':
      return 'Cleared: the Item is back to Normal';
    case 'STATUS_CHANGED':
      return `${label(event.fromStatus)} → ${label(event.toStatus)}`;
    case 'COMMENTED':
      return 'Comment';
  }
}

function History({ events }: { events: AlertEvent[] }) {
  return (
    <ol className="space-y-1.5 border-l pl-3">
      {events.map((event) => (
        <li key={event.id} className="text-xs">
          <div>
            <span className="font-medium">{describe(event)}</span>
            <span className="text-muted-foreground">
              {' '}
              · {event.user ? event.user.name : 'System'}
              {event.note ? `, ${event.note}` : ''} · {dateTime(event.createdAt)}
            </span>
          </div>
          {event.comment && <p className="mt-0.5 whitespace-pre-wrap rounded bg-muted px-2 py-1 text-sm">{event.comment}</p>}
        </li>
      ))}
    </ol>
  );
}

function CommentForm({ alertId }: { alertId: number }) {
  const [text, setText] = useState('');
  const comment = useCommentOnAlert();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    comment.mutate({ id: alertId, comment: text }, { onSuccess: () => setText('') });
  }
  return (
    <form onSubmit={submit} className="space-y-1">
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" aria-label="Comment" maxLength={2000} />
        <Button type="submit" size="sm" disabled={comment.isPending || !text.trim()}>
          Comment
        </Button>
      </div>
      {comment.error && <p role="alert" className="text-xs text-destructive">{comment.error.message}</p>}
    </form>
  );
}

/** Actions, history and comments of one Alert. */
export function AlertBody({ alert }: { alert: AlertDetail }) {
  const change = useChangeAlertStatus();
  return (
    <div className="space-y-3">
      {alert.status !== 'CLEARED' && (
        <div className="flex flex-wrap gap-1.5">
          {MANUAL_STATUSES.map((status) => (
            <Button
              key={status}
              size="sm"
              variant={alert.status === status ? 'default' : 'outline'}
              disabled={change.isPending || alert.status === status}
              onClick={() => change.mutate({ id: alert.id, status })}
            >
              {STATUS_LABELS[status]}
            </Button>
          ))}
        </div>
      )}
      {change.error && <p role="alert" className="text-xs text-destructive">{change.error.message}</p>}
      <History events={alert.events} />
      <CommentForm alertId={alert.id} />
    </div>
  );
}

/** One Alert row that expands to show its actions, history and comments. */
export function AlertItem({ alert }: { alert: AlertSummary }) {
  const [open, setOpen] = useState(false);
  const detail = useAlertDetail(alert.id, open);
  const quiet = alert.status === 'IGNORED' || alert.status === 'RESOLVED' || alert.status === 'CLEARED';
  return (
    <li className="px-3 py-2">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <LevelBadge level={alert.level} />
        <span className={cn('min-w-0 flex-1 truncate font-medium', quiet && 'text-muted-foreground')}>{alert.itemName}</span>
        <span className="text-xs text-muted-foreground">{STATUS_LABELS[alert.status]}</span>
      </button>
      {open && (
        <div className="mt-2">
          {detail.isPending && <p className="text-xs text-muted-foreground">Loading…</p>}
          {detail.error && <p role="alert" className="text-xs text-destructive">{detail.error.message}</p>}
          {detail.data && <AlertBody alert={detail.data} />}
        </div>
      )}
    </li>
  );
}

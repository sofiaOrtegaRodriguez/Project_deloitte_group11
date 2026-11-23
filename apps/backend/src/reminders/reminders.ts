// Reminders (spec "Alerts: Reminders", Seam C, ADR 0004): every ALERT_REPEAT_HOURS of REAL time, each open Alert
// whose Item is still Critical or Attention sends a Reminder, whatever its status.
//
// - Time comes from the injectable Clock, never from the Simulation (which only moves the Reference Date).
// - `tick()` is driven once a minute by a scheduler (not under NODE_ENV=test; tests call it after FakeClock.advance).
//   A round runs when at least ALERT_REPEAT_HOURS (read on every call, default 12) have passed since the last one.
// - The last round time lives in `reminder_state`, so restarts neither reset nor spam. The first tick ever only
//   sets that baseline.
// - A round: increments reminderCount, logs a "Reminder #n" event (system) and notifies every Active User with ONE
//   REMINDER Notification. Ignored/Resolved Alerts Reopen to New first; that Reopen's own ALERT_REOPENED
//   notification is suppressed and the REMINDER message says the Alert was reopened, so Users get one notice.
// - Alerts whose Item is Normal are left alone (the recalculation Clears them). Cleared Alerts are never touched.
// - Alerts with a Replenishment in Progress are skipped (hook: ./replenishment, filled in by ticket 17).
import { Inject, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { reopen } from '../alerts/alerts';
import { CLOCK, type Clock } from '../clock/clock';
import type { PrismaClient } from '../generated/prisma/client';
import { computeFromDatabase } from '../indicators/load-indicators';
import { notifyAllActiveUsers } from '../notifications/notifications';
import { PrismaService } from '../prisma/prisma.service';
import * as replenishment from './replenishment';

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_REPEAT_HOURS = 12;

/** ALERT_REPEAT_HOURS, read at call time. Falls back to 12 when unset or not a positive number. */
export function alertRepeatHours(): number {
  const value = Number(process.env.ALERT_REPEAT_HOURS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_REPEAT_HOURS;
}

export const reminderMessage = (itemName: string, count: number, reopenedFrom: string | null) =>
  reopenedFrom
    ? `Reminder #${count}: ${itemName} is still at risk. The Alert was ${reopenedFrom.toLowerCase()} and has been reopened.`
    : `Reminder #${count}: ${itemName} is still at risk.`;

/** Runs one Reminder round now. Returns the ids of the Alerts reminded. */
export async function runReminderRound(prisma: PrismaClient): Promise<number[]> {
  const { referenceDate, result } = await computeFromDatabase(prisma);
  if (!result) return [];
  const atRisk = new Set(
    result.items.filter((i) => i.urgencyLevel === 'CRITICAL' || i.urgencyLevel === 'ATTENTION').map((i) => i.itemId),
  );
  const open = await prisma.alert.findMany({
    where: { status: { not: 'CLEARED' } },
    include: { item: { select: { name: true } } },
    orderBy: { id: 'asc' },
  });
  const reminded: number[] = [];
  for (const alert of open) {
    if (!atRisk.has(alert.itemId)) continue;
    if (await replenishment.hasReplenishmentInProgress(prisma, alert.itemId, referenceDate)) continue;

    const reopenedFrom = alert.status === 'IGNORED' || alert.status === 'RESOLVED' ? alert.status : null;
    if (reopenedFrom) await reopen(prisma, alert.id, 'reminder', { notify: false });
    const count = alert.reminderCount + 1;
    await prisma.alert.update({
      where: { id: alert.id },
      data: { reminderCount: count, events: { create: { type: 'REMINDER', note: `Reminder #${count}` } } },
    });
    await notifyAllActiveUsers(prisma, {
      type: 'REMINDER',
      alertId: alert.id,
      itemId: alert.itemId,
      message: reminderMessage(alert.item.name, count, reopenedFrom),
    });
    reminded.push(alert.id);
  }
  return reminded;
}

@Injectable()
export class RemindersService {
  private running: Promise<boolean> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Runs a round if ALERT_REPEAT_HOURS of clock time have passed since the last one. Returns whether it ran. */
  tick(): Promise<boolean> {
    // Overlapping calls share the same pass so a slow round is never run twice.
    this.running ??= this.step().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async step(): Promise<boolean> {
    const now = this.clock.now();
    const state = await this.prisma.reminderState.findUnique({ where: { id: 1 } });
    if (!state) {
      await this.prisma.reminderState.create({ data: { id: 1, lastRoundAt: now } });
      return false;
    }
    if (now.getTime() - state.lastRoundAt.getTime() < alertRepeatHours() * HOUR_MS) return false;
    await this.prisma.reminderState.update({ where: { id: 1 }, data: { lastRoundAt: now } });
    await runReminderRound(this.prisma);
    return true;
  }
}

/** Calls `tick()` once a minute in real time. Disabled under tests, which call `tick()` themselves. */
@Injectable()
export class RemindersScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly reminders: RemindersService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      this.reminders.tick().catch((error) => console.error('Reminder round failed', error));
    }, 60_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

@Module({ providers: [RemindersService, RemindersScheduler], exports: [RemindersService] })
export class RemindersModule {}

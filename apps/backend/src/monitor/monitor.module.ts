// Live monitor (ticket 21): one polled endpoint with everything the Analysis page's monitor shows.
// No WebSockets: the frontend asks again every `refreshSeconds`.
import { BadRequestException, Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { DashboardModule, DashboardService, type KpiValues } from '../dashboard/dashboard.module';
import { PrismaService } from '../prisma/prisma.service';
import { SimulationModule, SimulationService } from '../simulation/simulation';

const DEFAULT_REFRESH_SECONDS = 30;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/** LIVE_MONITOR_REFRESH_SECONDS, read on each request. Missing, invalid or <= 0 falls back to 30. */
export function refreshSeconds(raw: string | undefined = process.env.LIVE_MONITOR_REFRESH_SECONDS): number {
  const value = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isFinite(value) && value > 0 ? value : DEFAULT_REFRESH_SECONDS;
}

export interface MonitorEvent {
  /** Unique across both sources: "alert-12" or "recommendation-7". */
  id: string;
  source: 'ALERT' | 'RECOMMENDATION';
  /** The AlertEventType or RecommendationEventType. */
  type: string;
  message: string;
  itemId: number;
  itemName: string;
  /** User name ("Name (removed)" for removed Users) or "system". */
  actor: string;
  createdAt: string;
  alertId: number | null;
  recommendationId: number | null;
}

export interface MonitorResponse {
  refreshSeconds: number;
  referenceDate: string | null;
  kpis: KpiValues | null;
  simulation: {
    status: string;
    currentDate: string | null;
    /** Real seconds per simulated day. */
    speed: number | null;
    datasetEnd: string | null;
  };
  events: MonitorEvent[];
}

interface Actor {
  name: string;
  status: string;
}
const actorName = (user: Actor | null): string => (user ? (user.status === 'REMOVED' ? `${user.name} (removed)` : user.name) : 'system');
const label = (value: string | null): string => (value ? value.charAt(0) + value.slice(1).toLowerCase() : '');

function alertMessage(e: { type: string; alertId: number; toLevel: string | null; toStatus: string | null }, actor: string, item: string): string {
  const alert = `Alert #${e.alertId}`;
  switch (e.type) {
    case 'CREATED':
      return `${alert} created (${label(e.toLevel)}) — ${item}`;
    case 'ESCALATED':
      return `${alert} escalated to ${label(e.toLevel)} — ${item}`;
    case 'LEVEL_LOWERED':
      return `${alert} lowered to ${label(e.toLevel)} — ${item}`;
    case 'STATUS_CHANGED':
      return `${alert} marked ${label(e.toStatus)} by ${actor} — ${item}`;
    case 'REOPENED':
      return `${alert} reopened — ${item}`;
    case 'CLEARED':
      return `${alert} cleared — ${item}`;
    case 'COMMENTED':
      return `${actor} commented on ${alert} — ${item}`;
    default:
      return `Reminder sent for ${alert} — ${item}`;
  }
}

const RECOMMENDATION_VERB: Record<string, string> = {
  CREATED: 'created',
  EDITED: 'edited',
  DISCARDED: 'discarded',
  UPDATED_TO_CURRENT: 'updated to current figures',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

function parseLimit(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > MAX_LIMIT) {
    throw new BadRequestException(`limit must be a whole number between 1 and ${MAX_LIMIT}`);
  }
  return Number(raw);
}

function parseSince(raw: string | undefined): Date | undefined {
  if (raw === undefined) return undefined;
  const date = new Date(raw);
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw) || Number.isNaN(date.getTime())) {
    throw new BadRequestException('since must be a timestamp like 2026-02-12T10:00:00Z');
  }
  return date;
}

@Injectable()
export class MonitorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
    private readonly simulation: SimulationService,
  ) {}

  async get(rawLimit?: string, rawSince?: string): Promise<MonitorResponse> {
    const limit = parseLimit(rawLimit);
    const since = parseSince(rawSince);
    const createdAt = since ? { gt: since } : undefined;
    const itemSelect = { select: { sourceItemId: true, name: true, id: true } } as const;
    const userSelect = { select: { name: true, status: true } } as const;

    const [dash, sim, alertEvents, recEvents] = await Promise.all([
      this.dashboard.get({}),
      this.simulation.status(),
      this.prisma.alertEvent.findMany({
        where: { createdAt },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        include: { user: userSelect, alert: { include: { item: itemSelect } } },
      }),
      this.prisma.recommendationEvent.findMany({
        where: { createdAt },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        include: { user: userSelect, recommendation: { include: { item: itemSelect } } },
      }),
    ]);

    const events: (MonitorEvent & { sortId: number })[] = [
      ...alertEvents.map((e) => {
        const actor = actorName(e.user);
        const item = e.alert.item;
        return {
          id: `alert-${e.id}`,
          sortId: e.id,
          source: 'ALERT' as const,
          type: e.type,
          message: alertMessage(e, actor, `${item.name} #${item.sourceItemId}`),
          itemId: item.id,
          itemName: item.name,
          actor,
          createdAt: e.createdAt.toISOString(),
          alertId: e.alertId,
          recommendationId: null,
        };
      }),
      ...recEvents.map((e) => {
        const actor = actorName(e.user);
        const item = e.recommendation.item;
        return {
          id: `recommendation-${e.id}`,
          sortId: e.id,
          source: 'RECOMMENDATION' as const,
          type: e.type,
          message: `Recommendation #${e.recommendationId} ${RECOMMENDATION_VERB[e.type] ?? e.type.toLowerCase()} by ${actor} — ${item.name} #${item.sourceItemId}`,
          itemId: item.id,
          itemName: item.name,
          actor,
          createdAt: e.createdAt.toISOString(),
          alertId: null,
          recommendationId: e.recommendationId,
        };
      }),
    ];
    events.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.sortId - a.sortId));

    return {
      refreshSeconds: refreshSeconds(),
      referenceDate: dash.referenceDate,
      kpis: dash.current,
      simulation: { status: sim.status, currentDate: sim.currentDate, speed: sim.secondsPerDay, datasetEnd: sim.datasetEnd },
      events: events.slice(0, limit).map(({ sortId: _sortId, ...event }) => event),
    };
  }
}

@Controller('monitor')
export class MonitorController {
  constructor(private readonly monitor: MonitorService) {}

  /** Requires login (global guard), any role. `limit` 1-100 (default 30); `since` keeps only newer events. */
  @Get()
  get(@Query('limit') limit?: string, @Query('since') since?: string): Promise<MonitorResponse> {
    return this.monitor.get(limit, since);
  }
}

@Module({ imports: [DashboardModule, SimulationModule], controllers: [MonitorController], providers: [MonitorService] })
export class MonitorModule {}

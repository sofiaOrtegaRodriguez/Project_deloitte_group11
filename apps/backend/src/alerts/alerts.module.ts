import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators';
import type { AuthUser } from '../auth/auth-user';
import type { AlertEventType, AlertLevel, AlertStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AlertClosedError,
  AlertNotFoundError,
  MANUAL_STATUSES,
  addComment,
  changeStatus,
  reopen,
  type ManualStatus,
} from './alerts';

export interface AlertSummary {
  id: number;
  itemId: number;
  itemName: string;
  category: string;
  level: AlertLevel;
  status: AlertStatus;
  priorityScore: number | null;
  reminderCount: number;
  /** Why the Alert last Reopened, when it did. */
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEventView {
  id: number;
  type: AlertEventType;
  fromStatus: AlertStatus | null;
  toStatus: AlertStatus | null;
  fromLevel: AlertLevel | null;
  toLevel: AlertLevel | null;
  /** Null means "system". A removed User shows as "Name (removed)". */
  user: { id: number; name: string } | null;
  comment: string | null;
  note: string | null;
  createdAt: string;
}

export interface AlertDetail extends AlertSummary {
  /** Oldest first: every transition and comment. */
  events: AlertEventView[];
}

const ITEM_SELECT = { select: { name: true, category: true } } as const;
const EVENT_INCLUDE = { user: { select: { id: true, name: true, status: true } } } as const;

type AlertRow = {
  id: number;
  itemId: number;
  level: AlertLevel;
  status: AlertStatus;
  priorityScore: number | null;
  reminderCount: number;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
  item: { name: string; category: string };
};
type EventRow = {
  id: number;
  type: AlertEventType;
  fromStatus: AlertStatus | null;
  toStatus: AlertStatus | null;
  fromLevel: AlertLevel | null;
  toLevel: AlertLevel | null;
  comment: string | null;
  note: string | null;
  createdAt: Date;
  user: { id: number; name: string; status: string } | null;
};

const toSummary = (a: AlertRow): AlertSummary => ({
  id: a.id,
  itemId: a.itemId,
  itemName: a.item.name,
  category: a.item.category,
  level: a.level,
  status: a.status,
  priorityScore: a.priorityScore,
  reminderCount: a.reminderCount,
  reason: a.reason,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

const toEvent = (e: EventRow): AlertEventView => ({
  id: e.id,
  type: e.type,
  fromStatus: e.fromStatus,
  toStatus: e.toStatus,
  fromLevel: e.fromLevel,
  toLevel: e.toLevel,
  user: e.user ? { id: e.user.id, name: e.user.status === 'REMOVED' ? `${e.user.name} (removed)` : e.user.name } : null,
  comment: e.comment,
  note: e.note,
  createdAt: e.createdAt.toISOString(),
});

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Open Alerts (every status except Cleared), by Urgency Level then Priority Score. */
  async list(options: { includeCleared?: boolean } = {}): Promise<AlertSummary[]> {
    const rows = await this.prisma.alert.findMany({
      where: options.includeCleared ? {} : { status: { not: 'CLEARED' } },
      include: { item: ITEM_SELECT },
      // Critical before Attention (enum order), then the higher Priority Score first.
      orderBy: [{ level: 'asc' }, { priorityScore: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
    });
    return rows.map(toSummary);
  }

  async detail(alertId: number): Promise<AlertDetail> {
    const row = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: { item: ITEM_SELECT, events: { include: EVENT_INCLUDE, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
    if (!row) throw new NotFoundException(`Alert ${alertId} not found`);
    return { ...toSummary(row), events: row.events.map(toEvent) };
  }

  /** Every Alert of an Item, newest first, with history and comments, for the Item detail page. */
  async forItem(itemId: number): Promise<AlertDetail[]> {
    const rows = await this.prisma.alert.findMany({
      where: { itemId },
      include: { item: ITEM_SELECT, events: { include: EVENT_INCLUDE, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
      orderBy: { id: 'desc' },
    });
    return rows.map((row) => ({ ...toSummary(row), events: row.events.map(toEvent) }));
  }

  /** A User changes the status by hand. */
  async transition(alertId: number, status: ManualStatus, user: AuthUser): Promise<AlertDetail> {
    await this.guard(() => changeStatus(this.prisma, alertId, status, { userId: user.id }));
    return this.detail(alertId);
  }

  async comment(alertId: number, text: string, user: AuthUser): Promise<AlertDetail> {
    await this.guard(() => addComment(this.prisma, alertId, user.id, text.trim()));
    return this.detail(alertId);
  }

  /**
   * For other modules (tickets 13/15/17): changes an Alert's status as "system, via Recommendation #N".
   * Logged with no user and the note "via Recommendation #N".
   */
  async changeStatusViaRecommendation(alertId: number, status: ManualStatus, recommendationId: number) {
    return changeStatus(this.prisma, alertId, status, { userId: null, note: `via Recommendation #${recommendationId}` });
  }

  /** For other modules: Reopens the same Alert (back to New) and records why, e.g. "expected delivery overdue". */
  async reopenAlert(alertId: number, reason: string) {
    return reopen(this.prisma, alertId, reason);
  }

  private async guard<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof AlertNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof AlertClosedError) throw new ConflictException(error.message);
      throw error;
    }
  }
}

export class TransitionDto {
  @IsIn([...MANUAL_STATUSES], { message: `status must be one of ${MANUAL_STATUSES.join(', ')}` })
  status!: ManualStatus;
}

export class CommentDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Write a comment' })
  @MaxLength(2000)
  comment!: string;
}

export class ListAlertsQuery {
  @IsOptional()
  @IsIn(['true', 'false'])
  includeCleared?: string;
}

@Controller()
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  /** Open Alerts by Urgency Level then Priority Score. Requires login (global guard). */
  @Get('alerts')
  list(@Query() query: ListAlertsQuery): Promise<AlertSummary[]> {
    return this.alerts.list({ includeCleared: query.includeCleared === 'true' });
  }

  @Get('alerts/:id')
  detail(@Param('id', ParseIntPipe) id: number): Promise<AlertDetail> {
    return this.alerts.detail(id);
  }

  @Get('items/:itemId/alerts')
  forItem(@Param('itemId', ParseIntPipe) itemId: number): Promise<AlertDetail[]> {
    return this.alerts.forItem(itemId);
  }

  @Post('alerts/:id/status')
  @HttpCode(200)
  transition(@Param('id', ParseIntPipe) id: number, @Body() body: TransitionDto, @CurrentUser() user: AuthUser) {
    return this.alerts.transition(id, body.status, user);
  }

  @Post('alerts/:id/comments')
  @HttpCode(201)
  comment(@Param('id', ParseIntPipe) id: number, @Body() body: CommentDto, @CurrentUser() user: AuthUser) {
    return this.alerts.comment(id, body.comment, user);
  }
}

@Module({ controllers: [AlertsController], providers: [AlertsService], exports: [AlertsService] })
export class AlertsModule {}

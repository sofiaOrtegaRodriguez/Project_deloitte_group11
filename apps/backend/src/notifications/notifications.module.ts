import { Controller, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { CurrentUser } from '../auth/decorators';
import type { AuthUser } from '../auth/auth-user';
import type { NotificationType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { notifyAllActiveUsers, notifyUser, type NotificationContent } from './notifications';

export interface NotificationView {
  id: number;
  type: NotificationType;
  alertId: number | null;
  itemId: number | null;
  recommendationId: number | null;
  message: string;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationList {
  notifications: NotificationView[];
  /** Unread Notifications of this User, regardless of the `unread` filter. */
  unreadCount: number;
}

type Row = Omit<NotificationView, 'createdAt' | 'readAt'> & { createdAt: Date; readAt: Date | null };
const toView = (n: Row): NotificationView => ({
  id: n.id,
  type: n.type,
  alertId: n.alertId,
  itemId: n.itemId,
  recommendationId: n.recommendationId,
  message: n.message,
  createdAt: n.createdAt.toISOString(),
  readAt: n.readAt ? n.readAt.toISOString() : null,
});

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** For other modules (Reminders, stale drafts, Recommendation decisions): notify one User. */
  notify(userId: number, content: NotificationContent): Promise<void> {
    return notifyUser(this.prisma, userId, content);
  }

  /** For other modules: notify every Active User. */
  notifyAll(content: NotificationContent): Promise<number> {
    return notifyAllActiveUsers(this.prisma, content);
  }

  async list(user: AuthUser, options: { unreadOnly?: boolean } = {}): Promise<NotificationList> {
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: user.id, ...(options.unreadOnly ? { readAt: null } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return { notifications: rows.map(toView), unreadCount };
  }

  /** Marks one of the User's own Notifications as read (idempotent). Someone else's is a 404. */
  async markRead(user: AuthUser, id: number): Promise<NotificationView> {
    const own = await this.prisma.notification.findFirst({ where: { id, userId: user.id } });
    if (!own) throw new NotFoundException(`Notification ${id} not found`);
    if (own.readAt) return toView(own);
    return toView(await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } }));
  }

  async markAllRead(user: AuthUser): Promise<{ updated: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }
}

export class ListNotificationsQuery {
  @IsOptional()
  @IsIn(['true', 'false'])
  unread?: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListNotificationsQuery): Promise<NotificationList> {
    return this.notifications.list(user, { unreadOnly: query.unread === 'true' });
  }

  // Declared before ':id/read' so "read-all" is never taken for an id.
  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(user, id);
  }
}

@Module({ controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}

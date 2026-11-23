import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { AccountStatus, Role, User, UserManagementAction } from '../generated/prisma/client';
import { normaliseEmail } from '../auth/auth-user';
import { hashPassword } from '../auth/password';
import { PrismaService } from '../prisma/prisma.service';

/** A User as shown in Settings → Users. Never includes the password hash. */
export interface UserSummary {
  id: number;
  name: string;
  email: string;
  role: Role;
  status: AccountStatus;
  createdAt: string;
}

/** A row of the User Management Log. */
export interface LogEntry {
  id: number;
  date: string;
  action: UserManagementAction;
  affectedUser: { id: number; name: string; email: string };
  actor: { id: number; name: string } | null;
}

export const toUserSummary = (u: User): UserSummary => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  createdAt: u.createdAt.toISOString(),
});

export const EMAIL_TAKEN = 'An account or access request already exists for this email';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a Pending account (an Access Request). Rejected Users don't block their email. */
  async register(name: string, email: string, password: string): Promise<void> {
    try {
      await this.prisma.user.create({
        data: {
          name: name.trim(),
          email: normaliseEmail(email),
          passwordHash: await hashPassword(password),
          role: 'PROCUREMENT_TEAM',
          status: 'PENDING',
        },
      });
    } catch (error) {
      // The partial unique index decides, so two simultaneous requests can't both succeed.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(EMAIL_TAKEN);
      }
      throw error;
    }
  }

  /** Users with the given statuses (all when omitted), newest first. Later tickets extend this (Removed, etc.). */
  async list(statuses?: AccountStatus[]): Promise<UserSummary[]> {
    const users = await this.prisma.user.findMany({
      where: statuses ? { status: { in: statuses } } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return users.map(toUserSummary);
  }

  countPending(): Promise<number> {
    return this.prisma.user.count({ where: { status: 'PENDING' } });
  }

  /** Approving makes the account Active with the Procurement Team role. */
  approve(id: number, actorId: number): Promise<UserSummary> {
    return this.decide(id, 'PENDING', 'ACTIVE', 'APPROVE', actorId);
  }

  reject(id: number, actorId: number): Promise<UserSummary> {
    return this.decide(id, 'PENDING', 'REJECTED', 'REJECT', actorId);
  }

  /** Removing blocks the User at once: the guard reads the status on every request. The Director cannot be removed. */
  async remove(id: number, actorId: number): Promise<UserSummary> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'DIRECTOR') throw new ForbiddenException('The Director cannot be removed');
    return this.decide(id, 'ACTIVE', 'REMOVED', 'REMOVE', actorId, 'Only an Active User can be removed');
  }

  restore(id: number, actorId: number): Promise<UserSummary> {
    return this.decide(id, 'REMOVED', 'ACTIVE', 'RESTORE', actorId, 'Only a Removed User can be restored');
  }

  /** The User Management Log, newest first. */
  async log(): Promise<LogEntry[]> {
    const rows = await this.prisma.userManagementLogEntry.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { affectedUser: true, actor: true },
    });
    return rows.map((r) => ({
      id: r.id,
      date: r.createdAt.toISOString(),
      action: r.action,
      affectedUser: { id: r.affectedUser.id, name: r.affectedUser.name, email: r.affectedUser.email },
      actor: r.actor ? { id: r.actor.id, name: r.actor.name } : null,
    }));
  }

  /** Moves a User between statuses and writes the log entry in the same transaction. */
  private async decide(
    id: number,
    from: AccountStatus,
    to: AccountStatus,
    action: UserManagementAction,
    actorId: number,
    conflict = 'This access request has already been decided',
  ): Promise<UserSummary> {
    return this.prisma.$transaction(async (tx) => {
      // The status in the WHERE makes a double click harmless.
      const result = await tx.user.updateMany({
        where: { id, status: from },
        data: { status: to, ...(to === 'ACTIVE' && from === 'PENDING' ? { role: 'PROCUREMENT_TEAM' as const } : {}) },
      });
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new NotFoundException('User not found');
      if (result.count === 0) throw new ConflictException(conflict);
      await tx.userManagementLogEntry.create({ data: { action, affectedUserId: id, actorId } });
      return toUserSummary(user);
    });
  }
}

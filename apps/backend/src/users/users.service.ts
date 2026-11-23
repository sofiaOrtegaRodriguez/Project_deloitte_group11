import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { AccountStatus, Role, User } from '../generated/prisma/client';
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
  approve(id: number): Promise<UserSummary> {
    return this.decide(id, 'ACTIVE');
  }

  reject(id: number): Promise<UserSummary> {
    return this.decide(id, 'REJECTED');
  }

  private async decide(id: number, status: 'ACTIVE' | 'REJECTED'): Promise<UserSummary> {
    // Only a Pending request can be decided; the status in the WHERE makes a double click harmless.
    const result = await this.prisma.user.updateMany({
      where: { id, status: 'PENDING' },
      data: { status, ...(status === 'ACTIVE' ? { role: 'PROCUREMENT_TEAM' as const } : {}) },
    });
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (result.count === 0) throw new ConflictException('This access request has already been decided');
    return toUserSummary(user);
  }
}

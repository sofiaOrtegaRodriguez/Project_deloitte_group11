import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNT_STATUS_MESSAGES, INVALID_CREDENTIALS } from './auth.constants';
import type { SessionPayload } from './auth.guard';
import { normaliseEmail, toAuthUser, type AuthUser } from './auth-user';
import { DUMMY_HASH, verifyPassword } from './password';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Checks the credentials and returns the User with a session token.
   * A wrong password or unknown email gives only the generic message. A status-specific message
   * is given only after a correct password.
   */
  async login(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
    const user = await this.findUserByEmail(normaliseEmail(email));
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !passwordOk) throw new UnauthorizedException(INVALID_CREDENTIALS);

    if (user.status !== 'ACTIVE') throw new ForbiddenException(ACCOUNT_STATUS_MESSAGES[user.status]);

    const payload: SessionPayload = { sub: user.id };
    return { user: toAuthUser(user), token: await this.jwt.signAsync(payload) };
  }

  /**
   * The User an email logs in as. A Rejected User frees its email for a new request,
   * so the User with that email who is not Rejected takes priority (the database allows only one).
   */
  private async findUserByEmail(email: string): Promise<User | null> {
    const users = await this.prisma.user.findMany({ where: { email }, orderBy: { createdAt: 'desc' } });
    return users.find((u) => u.status !== 'REJECTED') ?? users[0] ?? null;
  }
}

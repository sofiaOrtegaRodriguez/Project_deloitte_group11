import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth-user';
import type { AccountStatus } from '../generated/prisma/client';
import { UsersService, type LogEntry, type UserSummary } from './users.service';

export class RegisterDto {
  @IsString()
  @MinLength(1, { message: 'Enter your name' })
  @MaxLength(200)
  name!: string;

  // Trimmed before validation; the service stores it trimmed and lower-cased.
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(200)
  password!: string;
}

const STATUSES: AccountStatus[] = ['PENDING', 'ACTIVE', 'REJECTED', 'REMOVED'];

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Anyone can ask for access. The account is Pending until the Director decides. */
  @Public()
  @Post('auth/register')
  @HttpCode(201)
  async register(@Body() body: RegisterDto): Promise<{ message: string }> {
    await this.users.register(body.name, body.email, body.password);
    return { message: 'Your access request was sent. You can log in once the Director approves it.' };
  }

  /** `?status=PENDING,ACTIVE` filters by Account Status; without it every User is listed. */
  @Roles('DIRECTOR')
  @Get('users')
  list(@Query('status') status?: string): Promise<UserSummary[]> {
    const wanted = status?.split(',').filter((s): s is AccountStatus => STATUSES.includes(s as AccountStatus));
    return this.users.list(wanted?.length ? wanted : undefined);
  }

  @Roles('DIRECTOR')
  @Get('users/pending-count')
  async pendingCount(): Promise<{ count: number }> {
    return { count: await this.users.countPending() };
  }

  @Roles('DIRECTOR')
  @Post('users/:id/approve')
  @HttpCode(200)
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthUser): Promise<UserSummary> {
    return this.users.approve(id, actor.id);
  }

  @Roles('DIRECTOR')
  @Post('users/:id/reject')
  @HttpCode(200)
  reject(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthUser): Promise<UserSummary> {
    return this.users.reject(id, actor.id);
  }

  @Roles('DIRECTOR')
  @Post('users/:id/remove')
  @HttpCode(200)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthUser): Promise<UserSummary> {
    return this.users.remove(id, actor.id);
  }

  @Roles('DIRECTOR')
  @Post('users/:id/restore')
  @HttpCode(200)
  restore(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthUser): Promise<UserSummary> {
    return this.users.restore(id, actor.id);
  }

  @Roles('DIRECTOR')
  @Get('user-management-log')
  log(): Promise<LogEntry[]> {
    return this.users.log();
  }
}

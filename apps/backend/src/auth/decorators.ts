import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '../generated/prisma/client';
import type { AuthUser } from './auth-user';

export const IS_PUBLIC_KEY = 'hosstock:isPublic';
export const ROLES_KEY = 'hosstock:roles';

/** The endpoint can be called without logging in. Every other endpoint requires an Active User. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Only Users with one of these roles may call the endpoint; others get 403. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** The logged-in User, as loaded from the database by the AuthGuard on this request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);

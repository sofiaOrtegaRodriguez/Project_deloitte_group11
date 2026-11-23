import { AccountStatus } from '../generated/prisma/client';

/** Name of the httpOnly cookie that holds the session JWT. */
export const SESSION_COOKIE = 'hosstock_session';

/** How long a login lasts before the User has to log in again. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

/** The only message shown when the email or password is wrong, so the system doesn't reveal which accounts exist. */
export const INVALID_CREDENTIALS = 'Invalid email or password';

/** Shown only after a correct password, for accounts that can't log in. */
export const ACCOUNT_STATUS_MESSAGES: Record<Exclude<AccountStatus, 'ACTIVE'>, string> = {
  PENDING: 'Your access request is pending approval',
  REJECTED: 'Your access request was rejected',
  REMOVED: 'Your account has been removed',
};

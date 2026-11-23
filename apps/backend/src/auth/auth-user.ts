import type { Role, User } from '../generated/prisma/client';

/** What the API exposes about a logged-in User. Never includes the password hash. */
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export function toAuthUser(user: User): AuthUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

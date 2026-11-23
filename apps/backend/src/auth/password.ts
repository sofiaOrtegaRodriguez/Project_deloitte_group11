import * as bcrypt from 'bcryptjs';

const COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * A valid hash of a random value. Comparing against it when the email is unknown makes a failed
 * login take as long as a wrong password, so response times don't reveal which accounts exist.
 */
export const DUMMY_HASH = bcrypt.hashSync('hosstock-no-such-user', COST);

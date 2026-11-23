import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { findProjectRoot } from './env';
import { assertNoExampleSecrets, EXAMPLE_SECRETS } from './example-secrets';

const example = dotenv.parse(fs.readFileSync(path.join(findProjectRoot(), '.env.example')));
const safeEnv = { JWT_SECRET: 'a-real-secret-value', DIRECTOR_PASSWORD: 'a-real-password' };

describe('example secrets check', () => {
  it('knows the exact example values written in .env.example', () => {
    expect(EXAMPLE_SECRETS).toEqual({ JWT_SECRET: example.JWT_SECRET, DIRECTOR_PASSWORD: example.DIRECTOR_PASSWORD });
  });

  it('accepts values that were changed', () => {
    expect(() => assertNoExampleSecrets(safeEnv)).not.toThrow();
  });

  it.each(['JWT_SECRET', 'DIRECTOR_PASSWORD'] as const)('refuses %s left at its example value', (name) => {
    expect(() => assertNoExampleSecrets({ ...safeEnv, [name]: example[name] })).toThrow(
      new RegExp(`${name} still has the example value from \\.env\\.example`),
    );
  });

  it('names every offending variable at once', () => {
    expect(() => assertNoExampleSecrets({ JWT_SECRET: example.JWT_SECRET, DIRECTOR_PASSWORD: example.DIRECTOR_PASSWORD })).toThrow(
      /JWT_SECRET, DIRECTOR_PASSWORD/,
    );
  });
});

import { Injectable, OnModuleInit } from '@nestjs/common';

/** The placeholder values written in .env.example. A test keeps them in sync with that file. */
export const EXAMPLE_SECRETS = {
  JWT_SECRET: 'change-me-to-a-long-random-string',
  DIRECTOR_PASSWORD: 'change-me-please',
} as const;

/** Throws if a secret still has its example value: anyone reading .env.example would know it. */
export function assertNoExampleSecrets(env: Record<string, string | undefined> = process.env): void {
  const unchanged = (Object.keys(EXAMPLE_SECRETS) as (keyof typeof EXAMPLE_SECRETS)[]).filter(
    (name) => env[name] === EXAMPLE_SECRETS[name],
  );
  if (unchanged.length > 0) {
    throw new Error(
      `${unchanged.join(', ')} still has the example value from .env.example. ` +
        'Change it in your .env file to a value only you know, then start the backend again.',
    );
  }
}

/** Stops the backend from starting with example secrets. */
@Injectable()
export class ExampleSecretsCheck implements OnModuleInit {
  onModuleInit(): void {
    assertNoExampleSecrets();
  }
}

import { createTestApp } from './app';

describe('backend startup', () => {
  const original = { JWT_SECRET: process.env.JWT_SECRET, DIRECTOR_PASSWORD: process.env.DIRECTOR_PASSWORD };
  afterEach(() => {
    Object.assign(process.env, original);
  });

  it.each([
    ['JWT_SECRET', 'change-me-to-a-long-random-string'],
    ['DIRECTOR_PASSWORD', 'change-me-please'],
  ])('refuses to start when %s still has the value from .env.example', async (name, exampleValue) => {
    process.env[name] = exampleValue;
    await expect(createTestApp()).rejects.toThrow(new RegExp(`${name} still has the example value`));
  });

  it('starts when the secrets have been changed', async () => {
    const { app } = await createTestApp();
    await app.close();
  });
});

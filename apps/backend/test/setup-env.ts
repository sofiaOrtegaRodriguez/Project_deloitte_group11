// Runs in every API test worker: points the app and Prisma at the test database
// and uses fixed, known credentials so tests don't depend on the developer's .env.
import { loadEnv } from '../src/config/env';

loadEnv();
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.DIRECTOR_NAME = 'Test Director';
process.env.DIRECTOR_EMAIL = 'Director@Hospital.test';
process.env.DIRECTOR_PASSWORD = 'director-password';

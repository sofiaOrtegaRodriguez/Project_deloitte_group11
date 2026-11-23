// Two test projects:
// - unit: pure code, no database (Seam B and parsing). Run alone with `npm run test:unit`.
// - api:  backend behaviour against the separate test PostgreSQL database (Seam A).
//         The global setup creates that database and applies migrations; the ETL loads fixtures into it.
//
// Run through `npm test`, which starts Node with --experimental-vm-modules:
// the Prisma runtime loads its query compiler with a dynamic import().

// The generated Prisma client imports './x.js' paths that are .ts files on disk.
const moduleNameMapper = { '^(\\.{1,2}/.*)\\.js$': '$1' };
const transform = { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/test/tsconfig.json' }] };

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      rootDir: __dirname,
      roots: ['<rootDir>/src'],
      testMatch: ['**/*.spec.ts'],
      transform,
      moduleNameMapper,
    },
    {
      displayName: 'api',
      testEnvironment: 'node',
      rootDir: __dirname,
      roots: ['<rootDir>/test'],
      testMatch: ['**/*.e2e-spec.ts'],
      transform,
      moduleNameMapper,
      globalSetup: '<rootDir>/test/global-setup.ts',
      setupFiles: ['<rootDir>/test/setup-env.ts'],
      // Login tests hash several passwords with bcrypt (cost 12, pure JS): close to 1 s each on a slow
      // or power-saving machine, which can exceed Jest's default 5 s per test.
      testTimeout: 30_000,
    },
  ],
};

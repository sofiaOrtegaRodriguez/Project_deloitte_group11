import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

/** The repository root: the nearest ancestor folder whose package.json declares npm workspaces. */
export function findProjectRoot(start: string = __dirname): string {
  let dir = path.resolve(start);
  for (;;) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { workspaces?: unknown };
      if (pkg.workspaces) return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Could not find the Hosstock project root above ${start}`);
    dir = parent;
  }
}

/**
 * Loads the single `.env` file at the repository root into `process.env`.
 * Variables already set in the environment win, so tests and scripts can override them.
 */
export function loadEnv(): void {
  const envFile = path.join(findProjectRoot(), '.env');
  if (fs.existsSync(envFile)) dotenv.config({ path: envFile, quiet: true });
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Environment variable ${name} is not set. Copy .env.example to .env at the project root and fill it in.`,
    );
  }
  return value;
}

/** Absolute path of the dataset folder. A relative DATASET_PATH is resolved from the project root. */
export function getDatasetPath(): string {
  return path.resolve(findProjectRoot(), process.env.DATASET_PATH ?? '2-Hospital_Dataset');
}

import { Client } from 'pg';

/** Creates the database named in `connectionString` if it doesn't exist yet. Returns true if it was created. */
export async function ensureDatabase(connectionString: string): Promise<boolean> {
  const url = new URL(connectionString);
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!name) throw new Error(`No database name in connection string for host ${url.host}`);

  // Connect to the built-in `postgres` database to inspect and create others.
  url.pathname = '/postgres';
  const client = new Client({ connectionString: url.toString() });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Could not connect to PostgreSQL at ${url.host} as "${decodeURIComponent(url.username)}". ` +
        `Is the PostgreSQL service running, and are the user and password in .env correct?\n  ${(error as Error).message}`,
    );
  }
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (existing.rowCount) return false;
    await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    return true;
  } finally {
    await client.end();
  }
}

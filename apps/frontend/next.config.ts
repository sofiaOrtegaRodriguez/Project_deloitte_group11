import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import type { NextConfig } from 'next';

// The project keeps a single .env at the repository root (see .env.example).
const rootEnv = path.resolve(__dirname, '../../.env');
if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv, quiet: true });

const backendUrl = process.env.BACKEND_URL ?? `http://localhost:${process.env.BACKEND_PORT ?? 3001}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The browser only talks to the frontend; /api/* is forwarded to the backend.
  // The session cookie therefore stays first-party and no CORS setup is needed.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;

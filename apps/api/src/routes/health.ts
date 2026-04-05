import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/pg.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async (_, reply) => {
    const checks: Record<string, 'ok' | 'error'> = {};

    try {
      await getPool().query('SELECT 1');
      checks['postgres'] = 'ok';
    } catch {
      checks['postgres'] = 'error';
    }

    const ok = Object.values(checks).every((v) => v === 'ok');
    return reply.status(ok ? 200 : 503).send({
      status: ok ? 'ok' : 'degraded',
      checks,
      version: process.env.npm_package_version ?? '0.1.0',
      uptime: process.uptime(),
    });
  });
}

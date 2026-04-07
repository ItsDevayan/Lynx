/**
 * GET /api/monitor — Error trackers, event counts, top errors
 */

import type { FastifyInstance } from 'fastify';
import { PgEventStore, PgErrorTrackerStore } from '../db/stores.js';
import { query } from '../db/pg.js';

const eventStore = new PgEventStore();
const trackerStore = new PgErrorTrackerStore();

export async function monitorRoutes(app: FastifyInstance): Promise<void> {
  // List all error trackers
  app.get<{
    Querystring: { projectId?: string; page?: string; limit?: string; resolved?: string };
  }>('/api/monitor/trackers', async (req, reply) => {
    const { projectId, page, limit, resolved } = req.query;
    const trackers = await trackerStore.listAll(projectId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });

    const filtered =
      resolved !== undefined
        ? trackers.filter((t) => t.resolved === (resolved === 'true'))
        : trackers;

    return reply.send({ trackers: filtered, count: filtered.length });
  });

  // Get single tracker
  app.get<{ Params: { fingerprint: string } }>(
    '/api/monitor/trackers/:fingerprint',
    async (req, reply) => {
      const tracker = await trackerStore.findByFingerprint(req.params.fingerprint);
      if (!tracker) return reply.status(404).send({ error: 'Not found' });
      return reply.send(tracker);
    },
  );

  // Resolve a tracker
  app.post<{
    Params: { fingerprint: string };
    Body: { by: string; notes?: string };
  }>('/api/monitor/trackers/:fingerprint/resolve', async (req, reply) => {
    const { by, notes } = req.body;
    const tracker = await trackerStore.resolve(req.params.fingerprint, by, notes);
    return reply.send(tracker);
  });

  // Recent events
  app.get<{ Querystring: { projectId?: string; limit?: string } }>(
    '/api/monitor/events',
    async (req, reply) => {
      const events = await eventStore.findRecent(
        req.query.projectId,
        req.query.limit ? parseInt(req.query.limit, 10) : 100,
      );
      return reply.send({ events });
    },
  );

  // Severity counts
  app.get<{ Querystring: { projectId?: string } }>(
    '/api/monitor/counts',
    async (req, reply) => {
      const counts = await eventStore.countBySeverity(req.query.projectId);
      return reply.send(counts);
    },
  );

  // Error trends — daily counts for the last N days
  app.get<{ Querystring: { projectId?: string; days?: string } }>(
    '/api/monitor/trends',
    async (req, reply) => {
      const days = Math.min(30, Math.max(1, parseInt(req.query.days ?? '7', 10)));
      const pid  = req.query.projectId;
      try {
        const rows = await query<{ day: string; severity: string; count: string }>(
          `SELECT
             DATE_TRUNC('day', created_at)::date AS day,
             severity,
             COUNT(*) AS count
           FROM lynx_events
           WHERE created_at >= NOW() - INTERVAL '${days} days'
             ${pid ? "AND project_id = $1" : ''}
           GROUP BY 1, 2
           ORDER BY 1 ASC`,
          pid ? [pid] : [],
        );
        // Reshape to { date -> { ERROR: N, WARN: N, ... } }
        const byDay: Record<string, Record<string, number>> = {};
        for (const r of rows) {
          const d = String(r.day);
          byDay[d] = byDay[d] ?? {};
          byDay[d][r.severity] = parseInt(r.count, 10);
        }
        return reply.send({ days, trends: byDay });
      } catch {
        // Table may not exist yet
        return reply.send({ days, trends: {} });
      }
    },
  );

  // Search/filter trackers by keyword
  app.get<{
    Querystring: { projectId?: string; search?: string; severity?: string; limit?: string };
  }>(
    '/api/monitor/search',
    async (req, reply) => {
      const { projectId, search, severity, limit = '20' } = req.query;
      const trackers = await trackerStore.findAll(projectId, 200);
      let results = trackers;
      if (search) {
        const q = search.toLowerCase();
        results = results.filter(t =>
          t.errorName?.toLowerCase().includes(q) ||
          (t as any).sampleMessage?.toLowerCase().includes(q) ||
          t.layer?.toLowerCase().includes(q)
        );
      }
      if (severity) {
        results = results.filter(t => t.severity === severity.toUpperCase());
      }
      return reply.send({ trackers: results.slice(0, parseInt(limit, 10)), total: results.length });
    },
  );
}

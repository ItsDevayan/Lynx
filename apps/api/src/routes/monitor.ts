/**
 * GET /api/monitor — Error trackers, event counts, top errors
 */

import type { FastifyInstance } from 'fastify';
import { PgEventStore, PgErrorTrackerStore } from '../db/stores.js';

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
}

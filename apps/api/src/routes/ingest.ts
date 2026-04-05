/**
 * POST /api/ingest
 * Accepts LEMU-compatible + OTel telemetry events.
 */

import type { FastifyInstance } from 'fastify';
import { ingestEvents } from '@lynx/monitor';
import { PgEventStore, PgErrorTrackerStore } from '../db/stores.js';

const eventStore = new PgEventStore();
const trackerStore = new PgErrorTrackerStore();

export async function ingestRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: { events: unknown[] };
    Querystring: { projectId?: string };
  }>(
    '/api/ingest',
    {
      schema: {
        body: {
          type: 'object',
          required: ['events'],
          properties: {
            events: { type: 'array', maxItems: 1000 },
          },
        },
      },
    },
    async (req, reply) => {
      const { events } = req.body;
      const projectId = req.query.projectId;

      const result = await ingestEvents(events as any[], {
        eventStore,
        errorTrackerStore: trackerStore,
        projectId,
      });

      return reply.send(result);
    },
  );
}

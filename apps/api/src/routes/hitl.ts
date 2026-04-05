/**
 * /api/hitl — Human-in-the-loop approval queue
 */

import type { FastifyInstance } from 'fastify';
import { resolveRequest, setHITLStore, setHITLEventEmitter } from '@lynx/core';
import type { HITLStore, HITLRequest } from '@lynx/core';
import { query } from '../db/pg.js';

// ─── PostgreSQL HITL Store ────────────────────────────────────────────────────

class PgHITLStore implements HITLStore {
  async save(req: HITLRequest): Promise<void> {
    await query(
      `INSERT INTO hitl_requests (id, type, title, description, payload, status, created_at, timeout_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
      [
        req.id, req.type, req.title, req.description,
        JSON.stringify(req.payload), req.status,
        req.createdAt, req.timeoutAt ?? null,
      ],
    );
  }

  async update(id: string, updates: Partial<HITLRequest>): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if ('status' in updates) { sets.push(`status = $${i++}`); vals.push(updates.status); }
    if ('resolvedAt' in updates) { sets.push(`resolved_at = $${i++}`); vals.push(updates.resolvedAt ?? null); }
    if ('resolvedBy' in updates) { sets.push(`resolved_by = $${i++}`); vals.push(updates.resolvedBy ?? null); }
    if ('notes' in updates) { sets.push(`notes = $${i++}`); vals.push(updates.notes ?? null); }

    if (sets.length === 0) return;
    vals.push(id);
    await query(`UPDATE hitl_requests SET ${sets.join(', ')} WHERE id = $${i}`, vals);
  }

  async getById(id: string): Promise<HITLRequest | null> {
    const res = await query<Record<string, unknown>>(
      `SELECT * FROM hitl_requests WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToRequest(res.rows[0]) : null;
  }

  async listPending(): Promise<HITLRequest[]> {
    const res = await query<Record<string, unknown>>(
      `SELECT * FROM hitl_requests WHERE status = 'pending' ORDER BY created_at ASC`,
    );
    return res.rows.map(rowToRequest);
  }
}

function rowToRequest(row: Record<string, unknown>): HITLRequest {
  return {
    id: row['id'] as string,
    type: row['type'] as HITLRequest['type'],
    title: row['title'] as string,
    description: row['description'] as string,
    payload: typeof row['payload'] === 'string' ? JSON.parse(row['payload']) : (row['payload'] as object),
    status: row['status'] as HITLRequest['status'],
    createdAt: row['created_at'] as string,
    resolvedAt: row['resolved_at'] as string | undefined,
    resolvedBy: row['resolved_by'] as string | undefined,
    notes: row['notes'] as string | undefined,
    timeoutAt: row['timeout_at'] as string | undefined,
  };
}

// Register store globally so requestApproval() from core works
export const hitlStore = new PgHITLStore();
setHITLStore(hitlStore);

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function hitlRoutes(app: FastifyInstance): Promise<void> {
  // Wire event emitter to WebSocket broadcast
  setHITLEventEmitter({
    emit(event, data) {
      app.websocketServer?.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: event, data }));
        }
      });
    },
  });

  // List pending
  app.get('/api/hitl', async (_, reply) => {
    const pending = await hitlStore.listPending();
    return reply.send({ requests: pending, count: pending.length });
  });

  // Get single
  app.get<{ Params: { id: string } }>('/api/hitl/:id', async (req, reply) => {
    const req_ = await hitlStore.getById(req.params.id);
    if (!req_) return reply.status(404).send({ error: 'Not found' });
    return reply.send(req_);
  });

  // Approve
  app.post<{
    Params: { id: string };
    Body: { by?: string; notes?: string };
  }>('/api/hitl/:id/approve', async (req, reply) => {
    const { by, notes } = req.body ?? {};
    await resolveRequest(req.params.id, 'approved', { resolvedBy: by, notes });
    return reply.send({ ok: true });
  });

  // Reject
  app.post<{
    Params: { id: string };
    Body: { by?: string; notes?: string };
  }>('/api/hitl/:id/reject', async (req, reply) => {
    const { by, notes } = req.body ?? {};
    await resolveRequest(req.params.id, 'rejected', { resolvedBy: by, notes });
    return reply.send({ ok: true });
  });
}

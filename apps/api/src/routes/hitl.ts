/**
 * /api/hitl — Human-in-the-loop approval queue
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join, isAbsolute } from 'path';
import { resolveRequest, setHITLStore, setHITLEventEmitter } from '@lynx/core';
import type { HITLStore, HITLRequest } from '@lynx/core';
import { broadcast } from '../ws-registry.js';

// ─── Diff applier ─────────────────────────────────────────────────────────────

/**
 * Applies a unified diff string to files on disk.
 * Supports standard `--- a/file` / `+++ b/file` format.
 * Returns list of files modified.
 */
function applyUnifiedDiff(diff: string, projectPath: string): string[] {
  const modified: string[] = [];
  const fileBlocks = diff.split(/^--- /m).filter(Boolean);

  for (const block of fileBlocks) {
    const lines = block.split('\n');
    // Extract file path from `--- a/path` or `--- path`
    const fromLine = lines[0] ?? '';
    const toLine = lines.find(l => l.startsWith('+++ ')) ?? '';

    let filePath = (toLine.replace(/^\+\+\+ /, '').replace(/^[ab]\//, '').trim()) ||
                   (fromLine.replace(/^[ab]\//, '').trim());

    if (!filePath || filePath === '/dev/null') continue;

    // Resolve path relative to project
    const absPath = isAbsolute(filePath) ? filePath : join(projectPath, filePath);

    // Only allow paths inside the project directory (security check)
    if (!absPath.startsWith(projectPath)) continue;

    // Read existing file content (or empty for new files)
    let content: string[] = [];
    if (existsSync(absPath)) {
      content = readFileSync(absPath, 'utf8').split('\n');
    }

    // Parse hunks
    const hunkRe = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
    let lineIdx = lines.findIndex(l => l.startsWith('+++ ')) + 1;
    const newContent = [...content];
    let offset = 0; // track how line numbers shift after each hunk

    while (lineIdx < lines.length) {
      const hunkMatch = hunkRe.exec(lines[lineIdx]);
      if (!hunkMatch) { lineIdx++; continue; }

      const origStart = parseInt(hunkMatch[1], 10) - 1; // 0-based
      lineIdx++;

      const hunkLines: string[] = [];
      while (lineIdx < lines.length && !hunkRe.test(lines[lineIdx])) {
        hunkLines.push(lines[lineIdx]);
        lineIdx++;
      }

      // Apply hunk: replace range [origStart..origStart+removes] with additions
      const removes = hunkLines.filter(l => l.startsWith('-')).length;
      const adds    = hunkLines.filter(l => l.startsWith('+')).map(l => l.slice(1));

      const insertAt = origStart + offset;
      newContent.splice(insertAt, removes, ...adds);
      offset += adds.length - removes;
    }

    // Write result
    try {
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, newContent.join('\n'), 'utf8');
      modified.push(filePath);
    } catch { /* skip unwritable files */ }
  }

  return modified;
}

/**
 * For non-diff proposals (type = 'plan' or 'json'), write content to a
 * human-readable markdown file in .lynx/proposals/.
 */
function saveProposalFile(request: HITLRequest, projectPath: string): string {
  const dir = join(projectPath, '.lynx', 'proposals');
  mkdirSync(dir, { recursive: true });
  const filename = `${request.id.slice(0, 8)}-${request.action.toLowerCase().replace(/[^a-z0-9]/g, '-')}.md`;
  const filepath = join(dir, filename);
  const content = [
    `# ${request.title}`,
    '',
    `**Action:** ${request.action}  `,
    `**Created:** ${request.createdAt}  `,
    `**ID:** ${request.id}`,
    '',
    '## Description',
    request.description,
    '',
    '## Proposal',
    '```',
    request.proposal.content,
    '```',
  ].join('\n');
  writeFileSync(filepath, content, 'utf8');
  return filepath;
}
import { query } from '../db/pg.js';

// ─── PostgreSQL HITL Store ────────────────────────────────────────────────────

class PgHITLStore implements HITLStore {
  async save(req: HITLRequest): Promise<void> {
    await query(
      `INSERT INTO hitl_requests (id, action, title, description, thinking, proposal, context, status, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
      [
        req.id, req.action, req.title, req.description,
        req.thinking ?? null,
        JSON.stringify(req.proposal),
        JSON.stringify(req.context),
        req.status,
        req.createdAt,
        req.expiresAt ?? null,
      ],
    );
  }

  async update(id: string, updates: Partial<HITLRequest>): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if ('status' in updates)          { sets.push(`status = $${i++}`);           vals.push(updates.status); }
    if ('approvedBy' in updates)      { sets.push(`approved_by = $${i++}`);      vals.push(updates.approvedBy ?? null); }
    if ('approvedAt' in updates)      { sets.push(`approved_at = $${i++}`);      vals.push(updates.approvedAt ?? null); }
    if ('rejectedBy' in updates)      { sets.push(`rejected_by = $${i++}`);      vals.push(updates.rejectedBy ?? null); }
    if ('rejectedAt' in updates)      { sets.push(`rejected_at = $${i++}`);      vals.push(updates.rejectedAt ?? null); }
    if ('rejectionReason' in updates) { sets.push(`rejection_reason = $${i++}`); vals.push(updates.rejectionReason ?? null); }
    if ('modifiedProposal' in updates){ sets.push(`modified_proposal = $${i++}`); vals.push(updates.modifiedProposal ?? null); }

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
      `SELECT * FROM hitl_requests WHERE status = 'PENDING' ORDER BY created_at ASC`,
    );
    return res.rows.map(rowToRequest);
  }
}

function rowToRequest(row: Record<string, unknown>): HITLRequest {
  const parseJson = (v: unknown) => {
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } }
    return v ?? {};
  };
  return {
    id:               row['id'] as string,
    action:           (row['action'] as HITLRequest['action']) ?? 'CODE_CHANGE',
    title:            row['title'] as string,
    description:      row['description'] as string,
    thinking:         row['thinking'] as string | undefined,
    proposal:         parseJson(row['proposal']) as HITLRequest['proposal'],
    context:          parseJson(row['context']) as HITLRequest['context'],
    status:           (row['status'] as HITLRequest['status']) ?? 'PENDING',
    createdAt:        row['created_at'] as string,
    expiresAt:        row['expires_at'] as string | undefined,
    approvedBy:       row['approved_by'] as string | undefined,
    approvedAt:       row['approved_at'] as string | undefined,
    rejectedBy:       row['rejected_by'] as string | undefined,
    rejectedAt:       row['rejected_at'] as string | undefined,
    rejectionReason:  row['rejection_reason'] as string | undefined,
    modifiedProposal: row['modified_proposal'] as string | undefined,
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
      app.websocketServer?.clients.forEach((client: any) => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: event, data }));
        }
      });
    },
  });

  // Create new HITL request (from Brain or external agent)
  app.post<{
    Body: {
      title: string;
      description: string;
      action?: string;
      thinking?: string;
      proposal: HITLRequest['proposal'];
      context?: Partial<HITLRequest['context']>;
    };
  }>(
    '/api/hitl',
    {
      schema: {
        body: {
          type: 'object',
          required: ['title', 'description', 'proposal'],
          properties: {
            title:       { type: 'string' },
            description: { type: 'string' },
            action:      { type: 'string' },
            thinking:    { type: 'string' },
            proposal:    { type: 'object' },
            context:     { type: 'object' },
          },
        },
      },
    },
    async (req, reply) => {
      const { title, description, action, thinking, proposal, context } = req.body;

      const request: HITLRequest = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        status: 'PENDING',
        action: (action ?? 'CODE_CHANGE') as HITLRequest['action'],
        title,
        description,
        thinking,
        proposal,
        context: {
          triggeredBy: (context as any)?.triggeredBy ?? 'brain',
          projectId: (context as any)?.projectId,
          relatedEventId: (context as any)?.relatedEventId,
          relatedFingerprint: (context as any)?.relatedFingerprint,
        },
      };

      await hitlStore.save(request);

      // Broadcast to all connected dashboard WS clients
      broadcast({ type: 'hitl:created', data: request });

      return reply.status(201).send(request);
    },
  );

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

  // Approve (+ optionally apply diff to disk)
  app.post<{
    Params: { id: string };
    Body: { by?: string; notes?: string; apply?: boolean };
  }>('/api/hitl/:id/approve', async (req, reply) => {
    const { by, notes, apply = true } = req.body ?? {};
    const hitlReq = await hitlStore.getById(req.params.id);

    if (!hitlReq) return reply.status(404).send({ error: 'Not found' });

    await resolveRequest(req.params.id, 'APPROVED', { by });

    const result: { ok: boolean; applied?: boolean; modifiedFiles?: string[]; savedTo?: string } = { ok: true };

    if (apply && hitlReq.proposal) {
      const projectPath = (hitlReq.context as any)?.projectPath as string | undefined;
      if (projectPath && existsSync(projectPath)) {
        if (hitlReq.proposal.type === 'diff') {
          const modifiedFiles = applyUnifiedDiff(hitlReq.proposal.content, projectPath);
          result.applied = modifiedFiles.length > 0;
          result.modifiedFiles = modifiedFiles;
        } else {
          const savedTo = saveProposalFile(hitlReq, projectPath);
          result.applied = true;
          result.savedTo = savedTo;
        }

        // Broadcast apply event
        broadcast({
          type: 'hitl:applied',
          data: { id: req.params.id, modifiedFiles: result.modifiedFiles, savedTo: result.savedTo },
        });
      }
    }

    return reply.send(result);
  });

  // Reject
  app.post<{
    Params: { id: string };
    Body: { by?: string; notes?: string };
  }>('/api/hitl/:id/reject', async (req, reply) => {
    const { by, notes } = req.body ?? {};
    await resolveRequest(req.params.id, 'REJECTED', { by, rejectionReason: notes });
    return reply.send({ ok: true });
  });
}

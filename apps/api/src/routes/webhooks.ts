/**
 * /api/webhooks — External webhook receivers
 *
 * POST /api/webhooks/github  → GitHub push/PR/CI events
 *   - Validates X-Hub-Signature-256 (if GITHUB_WEBHOOK_SECRET is set)
 *   - Broadcasts relevant events over WS
 *   - Triggers re-scans on push events (if project path is configured)
 */

import type { FastifyInstance } from 'fastify';
import { createHmac } from 'crypto';
import { broadcast } from '../ws-registry.js';

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? '';

function verifySignature(payload: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return true; // no secret configured — accept all (dev mode)
  const expected = `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex')}`;
  // Constant-time compare
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

export async function webhooksRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/webhooks/github',
    {
      config: { rawBody: true }, // Fastify needs raw body for signature check
    },
    async (req, reply) => {
      const event     = req.headers['x-github-event'] as string ?? 'unknown';
      const signature = req.headers['x-hub-signature-256'] as string ?? '';
      const rawBody   = (req as any).rawBody ?? JSON.stringify(req.body);

      if (WEBHOOK_SECRET && !verifySignature(rawBody, signature)) {
        return reply.status(401).send({ error: 'Invalid signature' });
      }

      const payload = req.body as Record<string, any>;

      // ── Push event ────────────────────────────────────────────────────────
      if (event === 'push') {
        const branch = payload.ref?.replace('refs/heads/', '') ?? '';
        const repo   = payload.repository?.full_name ?? '';
        const commits = (payload.commits ?? []).length;

        app.log.info(`[webhook] push to ${repo}/${branch} (${commits} commit(s))`);

        broadcast({
          type: 'github:push',
          data: {
            repo, branch, commits,
            pusher:  payload.pusher?.name ?? '',
            message: payload.head_commit?.message?.slice(0, 100) ?? '',
            ts: new Date().toISOString(),
          },
        });
      }

      // ── Pull request event ────────────────────────────────────────────────
      if (event === 'pull_request') {
        const action = payload.action ?? '';
        const pr     = payload.pull_request;
        app.log.info(`[webhook] PR #${pr?.number} ${action} in ${payload.repository?.full_name}`);

        broadcast({
          type: 'github:pr',
          data: {
            action,
            number:  pr?.number,
            title:   pr?.title?.slice(0, 100) ?? '',
            author:  pr?.user?.login ?? '',
            url:     pr?.html_url ?? '',
            repo:    payload.repository?.full_name ?? '',
            ts: new Date().toISOString(),
          },
        });
      }

      // ── Workflow / CI run ─────────────────────────────────────────────────
      if (event === 'workflow_run') {
        const run    = payload.workflow_run;
        const status = run?.conclusion ?? run?.status ?? 'unknown';
        app.log.info(`[webhook] workflow_run ${run?.name} → ${status}`);

        broadcast({
          type: 'github:ci',
          data: {
            name:       run?.name ?? '',
            status,
            branch:     run?.head_branch ?? '',
            url:        run?.html_url ?? '',
            durationMs: run?.updated_at && run?.created_at
              ? new Date(run.updated_at).getTime() - new Date(run.created_at).getTime()
              : null,
            ts: new Date().toISOString(),
          },
        });
      }

      return reply.send({ ok: true, event });
    },
  );
}

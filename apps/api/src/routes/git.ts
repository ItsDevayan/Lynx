/**
 * /api/git — Git repository operations
 *
 * GET  /api/git/status   → working tree status (modified, staged, untracked)
 * GET  /api/git/diff     → unified diff of staged+unstaged changes
 * GET  /api/git/log      → recent commits (last 20)
 * GET  /api/git/branches → list local branches + current
 * POST /api/git/stage    → git add <files>
 * POST /api/git/commit   → git commit -m <message> (creates HITL if not confirmed)
 */

import type { FastifyInstance } from 'fastify';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';

const execFileP = promisify(execFile);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProjectPath(query: Record<string, string | undefined>): string | null {
  const p = query['projectPath'] as string | undefined;
  if (!p || !existsSync(p)) return null;
  if (!existsSync(join(p, '.git'))) return null;
  return p;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileP('git', args, {
    cwd,
    timeout: 15_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return stdout;
}

// ─── Status parser ────────────────────────────────────────────────────────────

interface GitFile {
  path: string;
  status: string;   // 'M', 'A', 'D', '?', 'R', etc.
  staged: boolean;
}

function parseStatus(raw: string): GitFile[] {
  const files: GitFile[] = [];
  for (const line of raw.split('\n')) {
    if (line.length < 3) continue;
    const xy = line.slice(0, 2);
    const path = line.slice(3).trim();
    if (!path) continue;

    const x = xy[0]; // staged
    const y = xy[1]; // unstaged

    if (x !== ' ' && x !== '?') {
      files.push({ path, status: x, staged: true });
    }
    if (y !== ' ' && y !== '?') {
      files.push({ path, status: y === '?' ? '?' : y, staged: false });
    }
    if (x === '?' && y === '?') {
      files.push({ path, status: '?', staged: false });
    }
  }
  return files;
}

interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
}

function parseLog(raw: string): GitCommit[] {
  return raw.trim().split('\n---\n').filter(Boolean).map(entry => {
    const lines = entry.split('\n');
    return {
      hash:      lines[0] ?? '',
      shortHash: (lines[0] ?? '').slice(0, 8),
      author:    lines[1] ?? '',
      date:      lines[2] ?? '',
      message:   lines[3] ?? '',
    };
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function gitRoutes(app: FastifyInstance): Promise<void> {
  // Status
  app.get<{ Querystring: { projectPath?: string } }>(
    '/api/git/status',
    async (req, reply) => {
      const projectPath = getProjectPath(req.query as Record<string, string | undefined>);
      if (!projectPath) return reply.status(400).send({ error: 'Not a git repo or path not found' });

      try {
        const raw = await git(projectPath, ['status', '--porcelain', '-u']);
        const branch = (await git(projectPath, ['branch', '--show-current'])).trim();
        const files = parseStatus(raw);

        return reply.send({
          branch,
          clean: files.length === 0,
          staged:    files.filter(f => f.staged),
          unstaged:  files.filter(f => !f.staged && f.status !== '?'),
          untracked: files.filter(f => f.status === '?'),
          summary: {
            staged:    files.filter(f => f.staged).length,
            unstaged:  files.filter(f => !f.staged && f.status !== '?').length,
            untracked: files.filter(f => f.status === '?').length,
          },
        });
      } catch (err: any) {
        return reply.status(500).send({ error: err?.message });
      }
    },
  );

  // Diff (staged + unstaged, truncated to 4000 chars)
  app.get<{ Querystring: { projectPath?: string; staged?: string } }>(
    '/api/git/diff',
    async (req, reply) => {
      const projectPath = getProjectPath(req.query as Record<string, string | undefined>);
      if (!projectPath) return reply.status(400).send({ error: 'Not a git repo or path not found' });

      try {
        const stagedOnly = req.query.staged === 'true';
        const args = stagedOnly ? ['diff', '--staged'] : ['diff', 'HEAD'];
        const diff = await git(projectPath, args);
        const truncated = diff.length > 8000;
        return reply.send({ diff: diff.slice(0, 8000), truncated, lines: diff.split('\n').length });
      } catch (err: any) {
        return reply.status(500).send({ error: err?.message });
      }
    },
  );

  // Log
  app.get<{ Querystring: { projectPath?: string; limit?: string } }>(
    '/api/git/log',
    async (req, reply) => {
      const projectPath = getProjectPath(req.query as Record<string, string | undefined>);
      if (!projectPath) return reply.status(400).send({ error: 'Not a git repo or path not found' });

      const limit = Math.min(parseInt(req.query.limit ?? '20', 10), 50);
      try {
        const raw = await git(projectPath, [
          'log', `--max-count=${limit}`,
          '--format=%H%n%an%n%ar%n%s---',
        ]);
        const commits = parseLog(raw);
        return reply.send({ commits, count: commits.length });
      } catch (err: any) {
        return reply.status(500).send({ error: err?.message });
      }
    },
  );

  // Branches
  app.get<{ Querystring: { projectPath?: string } }>(
    '/api/git/branches',
    async (req, reply) => {
      const projectPath = getProjectPath(req.query as Record<string, string | undefined>);
      if (!projectPath) return reply.status(400).send({ error: 'Not a git repo or path not found' });

      try {
        const raw = await git(projectPath, ['branch', '-a', '--format=%(refname:short)|%(HEAD)']);
        const current = (await git(projectPath, ['branch', '--show-current'])).trim();
        const branches = raw.trim().split('\n').filter(Boolean).map(l => {
          const [name, head] = l.split('|');
          return { name: name?.trim() ?? '', current: head?.trim() === '*' };
        });
        return reply.send({ branches, current });
      } catch (err: any) {
        return reply.status(500).send({ error: err?.message });
      }
    },
  );

  // Stage files
  app.post<{
    Body: { projectPath: string; files: string[] | 'all' };
  }>(
    '/api/git/stage',
    {
      schema: {
        body: {
          type: 'object',
          required: ['projectPath', 'files'],
          properties: {
            projectPath: { type: 'string' },
            files:       { },
          },
        },
      },
    },
    async (req, reply) => {
      const { projectPath, files } = req.body;
      if (!existsSync(projectPath) || !existsSync(join(projectPath, '.git'))) {
        return reply.status(400).send({ error: 'Not a git repo' });
      }
      try {
        const args = files === 'all' ? ['add', '-A'] : ['add', '--', ...(files as string[])];
        await git(projectPath, args);
        return reply.send({ ok: true });
      } catch (err: any) {
        return reply.status(500).send({ error: err?.message });
      }
    },
  );

  // Commit (creates HITL request for confirmation)
  app.post<{
    Body: { projectPath: string; message: string; confirm?: boolean };
  }>(
    '/api/git/commit',
    {
      schema: {
        body: {
          type: 'object',
          required: ['projectPath', 'message'],
          properties: {
            projectPath: { type: 'string' },
            message:     { type: 'string' },
            confirm:     { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const { projectPath, message, confirm = false } = req.body;
      if (!existsSync(projectPath) || !existsSync(join(projectPath, '.git'))) {
        return reply.status(400).send({ error: 'Not a git repo' });
      }

      if (!confirm) {
        // Return preview without committing
        try {
          const statusRaw = await git(projectPath, ['status', '--porcelain', '-u']);
          const diff = await git(projectPath, ['diff', '--staged']).catch(() => '');
          const branch = (await git(projectPath, ['branch', '--show-current'])).trim();
          return reply.send({
            preview: true,
            branch,
            message,
            staged: parseStatus(statusRaw).filter(f => f.staged).map(f => f.path),
            diff: diff.slice(0, 3000),
          });
        } catch (err: any) {
          return reply.status(500).send({ error: err?.message });
        }
      }

      try {
        await git(projectPath, ['commit', '-m', message]);
        const log = await git(projectPath, ['log', '--max-count=1', '--format=%H %s']);
        const [hash, ...msgParts] = log.trim().split(' ');
        return reply.send({ ok: true, hash: hash?.slice(0, 8), message: msgParts.join(' ') });
      } catch (err: any) {
        return reply.status(500).send({ error: err?.message });
      }
    },
  );
}

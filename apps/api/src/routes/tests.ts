/**
 * /api/tests — Test runner
 *
 * POST /api/tests/run   → SSE stream: spawn test process, stream output
 * GET  /api/tests/last  → last run result (in-memory cache)
 */

import type { FastifyInstance } from 'fastify';
import { existsSync } from 'fs';
import { spawn } from 'child_process';

// ─── Known test frameworks → commands ────────────────────────────────────────

const FRAMEWORK_CMDS: Record<string, string[]> = {
  vitest:  ['npx', 'vitest', 'run', '--reporter=verbose'],
  jest:    ['npx', 'jest', '--passWithNoTests', '--verbose'],
  mocha:   ['npx', 'mocha', '--reporter', 'spec'],
  pytest:  ['python', '-m', 'pytest', '-v'],
  go:      ['go', 'test', './...', '-v'],
  cargo:   ['cargo', 'test'],
  unknown: [],
};

interface LastRun {
  framework: string;
  projectPath: string;
  pass: boolean;
  exitCode: number;
  lines: string[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

let _lastRun: LastRun | null = null;

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function testsRoutes(app: FastifyInstance): Promise<void> {

  // ── POST /api/tests/run ──────────────────────────────────────────────────
  app.post<{
    Body: {
      projectPath: string;
      framework?: string;
      cmd?: string;
    };
  }>(
    '/api/tests/run',
    {
      schema: {
        body: {
          type: 'object',
          required: ['projectPath'],
          properties: {
            projectPath: { type: 'string' },
            framework:   { type: 'string' },
            cmd:         { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { projectPath, framework = 'unknown', cmd } = req.body;

      if (!existsSync(projectPath)) {
        return reply.status(400).send({ error: 'Project path does not exist' });
      }

      // Determine command to run
      let args: string[];
      if (cmd) {
        // User-provided command string — split on spaces
        const parts = cmd.trim().split(/\s+/);
        args = parts;
      } else {
        args = FRAMEWORK_CMDS[framework] ?? FRAMEWORK_CMDS.unknown;
      }

      if (args.length === 0) {
        return reply.status(400).send({
          error: `Unknown test framework: ${framework}. Provide a cmd parameter.`,
        });
      }

      // Set up SSE
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const sendEvent = (data: object) => {
        try { reply.raw.write(`data: ${JSON.stringify(data)}\n\n`); } catch { /* client gone */ }
      };

      const startedAt = new Date().toISOString();
      const startMs = Date.now();
      const lines: string[] = [];

      sendEvent({ type: 'start', framework, cmd: args.join(' ') });

      const proc = spawn(args[0], args.slice(1), {
        cwd: projectPath,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
        shell: process.platform === 'win32',
        timeout: 120_000,
      });

      const handleOutput = (data: Buffer) => {
        const text = data.toString('utf8');
        for (const raw of text.split('\n')) {
          const line = raw.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').trimEnd(); // strip ANSI
          if (!line && lines[lines.length - 1] === '') continue; // dedupe blank lines
          lines.push(line);
          sendEvent({ type: 'line', text: line });
        }
      };

      proc.stdout.on('data', handleOutput);
      proc.stderr.on('data', handleOutput);

      proc.on('close', (code) => {
        const pass = code === 0;
        const durationMs = Date.now() - startMs;
        const finishedAt = new Date().toISOString();

        _lastRun = { framework, projectPath, pass, exitCode: code ?? -1, lines, startedAt, finishedAt, durationMs };

        sendEvent({ type: 'done', pass, exitCode: code, durationMs });
        reply.raw.end();
      });

      proc.on('error', (err) => {
        sendEvent({ type: 'error', message: err.message });
        sendEvent({ type: 'done', pass: false, exitCode: -1, durationMs: Date.now() - startMs });
        reply.raw.end();
      });

      // Clean up if client disconnects
      req.raw.on('close', () => {
        try { proc.kill(); } catch { /* already dead */ }
      });
    },
  );

  // ── GET /api/tests/last ──────────────────────────────────────────────────
  app.get('/api/tests/last', async (_, reply) => {
    if (!_lastRun) return reply.status(404).send({ error: 'No test run yet' });
    return reply.send(_lastRun);
  });
}

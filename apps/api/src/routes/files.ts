/**
 * /api/files — Project file operations
 *
 * POST /api/files/search  → Search project files (ripgrep or fallback)
 * POST /api/files/read    → Read a specific file (with line range)
 * GET  /api/files/tree    → Directory tree (shallow, max depth 3)
 */

import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { join, relative, extname, dirname } from 'path';
import { spawn } from 'child_process';
import { execute } from '@lynx/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', '.turbo',
  '__pycache__', '.venv', 'venv', 'target', 'vendor', '.cache',
  'coverage', '.nyc_output', '.parcel-cache', '.svelte-kit',
]);

const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
  '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.env',
  '.sh', '.bash', '.zsh', '.fish',
  '.html', '.css', '.scss', '.sass', '.less',
  '.sql', '.graphql', '.gql', '.proto',
  '.dockerfile', '.Dockerfile',
]);

interface SearchMatch {
  file: string;       // relative path
  line: number;
  col: number;
  text: string;       // matched line content
}

interface SearchResult {
  query: string;
  projectPath: string;
  matches: SearchMatch[];
  total: number;
  truncated: boolean;
  summary?: string;
}

/** Try ripgrep first, fall back to Node recursive grep */
async function searchFiles(
  projectPath: string,
  query: string,
  maxResults: number,
  caseSensitive: boolean,
): Promise<SearchMatch[]> {
  // Try ripgrep
  const rgAvailable = await tryRipgrep(projectPath, query, maxResults, caseSensitive);
  if (rgAvailable !== null) return rgAvailable;

  // Fallback: Node recursive search
  return nodeSearch(projectPath, query, maxResults, caseSensitive);
}

function tryRipgrep(
  dir: string,
  pattern: string,
  maxResults: number,
  caseSensitive: boolean,
): Promise<SearchMatch[] | null> {
  return new Promise((resolve) => {
    const args = [
      '--json',
      '--max-count', '3',           // max matches per file
      '--max-filesize', '500K',
      '-n',                          // line numbers
      ...(caseSensitive ? [] : ['-i']),
      pattern,
      dir,
    ];

    const rg = spawn('rg', args, { timeout: 8000 });
    const chunks: string[] = [];
    let errored = false;

    rg.on('error', () => { errored = true; resolve(null); });
    rg.stdout.on('data', (d: Buffer) => chunks.push(d.toString()));
    rg.on('close', (code) => {
      if (errored) return;
      // rg exits 1 for no matches (not an error), 2 for actual error
      if (code === 2) { resolve(null); return; }

      const matches: SearchMatch[] = [];
      for (const line of chunks.join('').split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'match') {
            const d = obj.data;
            matches.push({
              file: relative(dir, d.path.text),
              line: d.line_number,
              col: d.submatches?.[0]?.start ?? 0,
              text: d.lines.text.trimEnd(),
            });
            if (matches.length >= maxResults) break;
          }
        } catch { /* skip malformed json line */ }
      }
      resolve(matches);
    });
  });
}

function nodeSearch(
  dir: string,
  pattern: string,
  maxResults: number,
  caseSensitive: boolean,
): SearchMatch[] {
  const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
  const matches: SearchMatch[] = [];

  function walk(current: string, depth: number): void {
    if (depth > 6 || matches.length >= maxResults) return;
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { return; }

    for (const e of entries) {
      if (matches.length >= maxResults) return;
      const full = join(current, e.name);
      if (e.isDirectory()) {
        if (!IGNORED_DIRS.has(e.name)) walk(full, depth + 1);
      } else if (e.isFile() && TEXT_EXTS.has(extname(e.name).toLowerCase())) {
        try {
          const size = statSync(full).size;
          if (size > 512_000) continue; // skip big files
          const lines = readFileSync(full, 'utf8').split('\n');
          for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(regex);
            if (m) {
              matches.push({
                file: relative(dir, full),
                line: i + 1,
                col: lines[i].search(regex),
                text: lines[i].trimEnd(),
              });
              if (matches.length >= maxResults) return;
            }
          }
        } catch { /* unreadable file */ }
      }
    }
  }

  walk(dir, 0);
  return matches;
}

/** Build a directory tree up to maxDepth */
function buildTree(dir: string, maxDepth = 3, depth = 0): object {
  if (depth >= maxDepth) return {};
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return {}; }

  const tree: Record<string, object | null> = {};
  for (const e of entries.slice(0, 60)) {
    if (IGNORED_DIRS.has(e.name)) continue;
    if (e.isDirectory()) {
      tree[e.name + '/'] = buildTree(join(dir, e.name), maxDepth, depth + 1);
    } else {
      tree[e.name] = null;
    }
  }
  return tree;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function filesRoutes(app: FastifyInstance): Promise<void> {

  // ── POST /api/files/search ───────────────────────────────────────────────
  app.post<{
    Body: {
      query: string;
      projectPath: string;
      maxResults?: number;
      caseSensitive?: boolean;
      summarize?: boolean;
    };
  }>(
    '/api/files/search',
    {
      schema: {
        body: {
          type: 'object',
          required: ['query', 'projectPath'],
          properties: {
            query:         { type: 'string', minLength: 1, maxLength: 200 },
            projectPath:   { type: 'string' },
            maxResults:    { type: 'number', minimum: 1, maximum: 100 },
            caseSensitive: { type: 'boolean' },
            summarize:     { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const { query, projectPath, maxResults = 30, caseSensitive = false, summarize = false } = req.body;

      if (!existsSync(projectPath)) {
        return reply.status(400).send({ error: 'Project path does not exist' });
      }

      try {
        const matches = await searchFiles(projectPath, query, maxResults, caseSensitive);
        const truncated = matches.length >= maxResults;

        const result: SearchResult = {
          query,
          projectPath,
          matches,
          total: matches.length,
          truncated,
        };

        // Optionally ask executor LLM to summarize findings
        if (summarize && matches.length > 0) {
          try {
            const snippet = matches.slice(0, 10).map((m) =>
              `${m.file}:${m.line} → ${m.text.slice(0, 120)}`
            ).join('\n');

            const resp = await execute([
              {
                role: 'system',
                content: 'You are a code analyst. Given search results from a codebase, provide a brief 2-3 sentence summary of what you found and what it means.',
              },
              {
                role: 'user',
                content: `Search query: "${query}"\n\nMatches (${matches.length} total):\n${snippet}\n\nSummarize what these results tell us about the codebase.`,
              },
            ], { maxTokens: 256, temperature: 0.1 });

            result.summary = resp.content;
          } catch { /* summary is optional — skip on error */ }
        }

        return reply.send(result);
      } catch (err) {
        app.log.error(err, '[files] search error');
        return reply.status(500).send({ error: String(err) });
      }
    },
  );

  // ── POST /api/files/read ─────────────────────────────────────────────────
  app.post<{
    Body: {
      filePath: string;
      startLine?: number;
      endLine?: number;
    };
  }>(
    '/api/files/read',
    {
      schema: {
        body: {
          type: 'object',
          required: ['filePath'],
          properties: {
            filePath:  { type: 'string' },
            startLine: { type: 'number', minimum: 1 },
            endLine:   { type: 'number', minimum: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const { filePath, startLine, endLine } = req.body;

      if (!existsSync(filePath)) {
        return reply.status(404).send({ error: 'File not found' });
      }

      try {
        const stat = statSync(filePath);
        if (stat.size > 1_000_000) {
          return reply.status(400).send({ error: 'File too large (>1MB). Use search instead.' });
        }

        const lines = readFileSync(filePath, 'utf8').split('\n');
        const start = Math.max(0, (startLine ?? 1) - 1);
        const end   = Math.min(lines.length, endLine ?? lines.length);
        const slice = lines.slice(start, end);

        return reply.send({
          filePath,
          startLine: start + 1,
          endLine: start + slice.length,
          totalLines: lines.length,
          content: slice.join('\n'),
          ext: extname(filePath),
        });
      } catch (err) {
        return reply.status(500).send({ error: String(err) });
      }
    },
  );

  // ── GET /api/files/tree ──────────────────────────────────────────────────
  app.get<{ Querystring: { path: string; depth?: string } }>(
    '/api/files/tree',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['path'],
          properties: {
            path:  { type: 'string' },
            depth: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { path: dirPath, depth = '3' } = req.query;
      if (!existsSync(dirPath)) {
        return reply.status(404).send({ error: 'Path not found' });
      }
      const maxDepth = Math.min(5, Math.max(1, parseInt(depth, 10) || 3));
      return reply.send({ path: dirPath, tree: buildTree(dirPath, maxDepth) });
    },
  );

  // POST /api/files/write — write (or overwrite) a file
  app.post<{
    Body: {
      filePath: string;
      content: string;
      createDirs?: boolean;
    };
  }>(
    '/api/files/write',
    {
      schema: {
        body: {
          type: 'object',
          required: ['filePath', 'content'],
          properties: {
            filePath:   { type: 'string' },
            content:    { type: 'string' },
            createDirs: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const { filePath, content, createDirs = true } = req.body;

      // Safety: only allow writing within paths that look like project files
      if (filePath.includes('..') || filePath.startsWith('/etc') || filePath.startsWith('/sys')) {
        return reply.status(400).send({ error: 'Unsafe path' });
      }

      try {
        if (createDirs) {
          mkdirSync(dirname(filePath), { recursive: true });
        }
        // Capture old content for response
        const oldContent = existsSync(filePath) ? readFileSync(filePath, 'utf8') : null;
        writeFileSync(filePath, content, 'utf8');
        return reply.send({
          ok: true,
          filePath,
          linesWritten: content.split('\n').length,
          created: oldContent === null,
        });
      } catch (err: any) {
        return reply.status(500).send({ error: err.message ?? 'Write failed' });
      }
    },
  );
}

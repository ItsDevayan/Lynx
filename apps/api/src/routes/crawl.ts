/**
 * /api/crawl — RAG indexing into Qdrant
 *
 * POST /api/crawl        → index project files (SSE stream of progress)
 * GET  /api/crawl/status → collection stats
 * POST /api/crawl/search → semantic search over indexed code
 *
 * Uses Qdrant HTTP API directly (no extra dep — pure fetch).
 * Embeddings: executor LLM via /api/v1/embeddings (Ollama-compatible),
 *             or falls back to a simple BM25-style bag-of-words if no embedding model.
 */

import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';
import { execute } from '@lynx/core';

// ─── Config ───────────────────────────────────────────────────────────────────

const QDRANT_URL  = process.env.QDRANT_URL  ?? 'http://localhost:6333';
const COLLECTION  = process.env.QDRANT_COLLECTION ?? 'lynx_code';
const EMBED_URL   = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'nomic-embed-text';
const VECTOR_SIZE = parseInt(process.env.VECTOR_SIZE ?? '768', 10);
const CHUNK_LINES = 40;   // lines per chunk
const CHUNK_OVERLAP = 5;  // overlap between chunks

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.turbo',
  'out', 'coverage', '__pycache__', 'venv', '.venv', 'target', 'vendor',
]);
const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp',
  '.rb', '.php', '.ex', '.exs',
  '.md', '.yaml', '.yml', '.json', '.toml', '.env.example',
]);

// ─── Qdrant helpers ───────────────────────────────────────────────────────────

async function qdrantReq(path: string, method: string, body?: unknown): Promise<any> {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qdrant ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function ensureCollection(): Promise<void> {
  try {
    await qdrantReq(`/collections/${COLLECTION}`, 'GET');
  } catch {
    // Create collection
    await qdrantReq(`/collections/${COLLECTION}`, 'PUT', {
      vectors: {
        size: VECTOR_SIZE,
        distance: 'Cosine',
      },
    });
  }
}

async function upsertPoints(points: Array<{
  id: number;
  vector: number[];
  payload: Record<string, unknown>;
}>): Promise<void> {
  await qdrantReq(`/collections/${COLLECTION}/points`, 'PUT', {
    points,
    wait: false,
  });
}

// ─── Embedding ────────────────────────────────────────────────────────────────

/** Attempt Ollama embedding; return null if unavailable */
async function embedOllama(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${EMBED_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { embedding?: number[] };
    return data.embedding ?? null;
  } catch {
    return null;
  }
}

/**
 * Fallback: term-frequency vector (bag of words hashed to VECTOR_SIZE dims).
 * Not semantic, but enables exact search when Ollama not available.
 */
function embedFallback(text: string): number[] {
  const vec = new Float32Array(VECTOR_SIZE).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(t => t.length > 2);
  for (const t of tokens) {
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    vec[h % VECTOR_SIZE] += 1;
  }
  // L2 normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return Array.from(vec).map(v => v / norm);
}

async function embed(text: string): Promise<number[]> {
  const ollamaVec = await embedOllama(text);
  if (ollamaVec && ollamaVec.length === VECTOR_SIZE) return ollamaVec;
  return embedFallback(text);
}

// ─── File walking & chunking ──────────────────────────────────────────────────

function walkFiles(dir: string, files: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return files; }

  for (const entry of entries) {
    if (entry.startsWith('.') && entry !== '.env.example') continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }

    if (st.isDirectory()) {
      if (!IGNORED_DIRS.has(entry)) walkFiles(full, files);
    } else if (CODE_EXTS.has(extname(entry).toLowerCase())) {
      if (st.size < 500_000) files.push(full); // skip >500 KB files
    }
  }
  return files;
}

interface Chunk {
  file: string;      // relative path
  startLine: number;
  endLine: number;
  content: string;
}

function chunkFile(filePath: string, projectPath: string): Chunk[] {
  let text: string;
  try { text = readFileSync(filePath, 'utf8'); } catch { return []; }

  const lines = text.split('\n');
  const relPath = relative(projectPath, filePath).replace(/\\/g, '/');
  const chunks: Chunk[] = [];

  for (let i = 0; i < lines.length; i += CHUNK_LINES - CHUNK_OVERLAP) {
    const end = Math.min(i + CHUNK_LINES, lines.length);
    chunks.push({
      file: relPath,
      startLine: i + 1,
      endLine: end,
      content: `// ${relPath}:${i + 1}-${end}\n${lines.slice(i, end).join('\n')}`,
    });
    if (end === lines.length) break;
  }
  return chunks;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function crawlRoutes(app: FastifyInstance): Promise<void> {
  // Status
  app.get('/api/crawl/status', async (_, reply) => {
    try {
      const data = await qdrantReq(`/collections/${COLLECTION}`, 'GET');
      return reply.send({
        available: true,
        collection: COLLECTION,
        vectorSize: VECTOR_SIZE,
        embedModel: EMBED_MODEL,
        points: data?.result?.points_count ?? 0,
        status: data?.result?.status ?? 'unknown',
      });
    } catch {
      return reply.send({
        available: false,
        collection: COLLECTION,
        error: `Qdrant not reachable at ${QDRANT_URL}`,
      });
    }
  });

  // Crawl + index (SSE stream)
  app.post<{ Body: { projectPath: string; force?: boolean } }>(
    '/api/crawl',
    {
      schema: {
        body: {
          type: 'object',
          required: ['projectPath'],
          properties: {
            projectPath: { type: 'string' },
            force:       { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const { projectPath, force = false } = req.body;

      if (!existsSync(projectPath)) {
        return reply.status(400).send({ error: 'Project path does not exist' });
      }

      reply.raw.setHeader('content-type', 'text/event-stream');
      reply.raw.setHeader('cache-control', 'no-cache');
      reply.raw.setHeader('connection', 'keep-alive');
      reply.raw.flushHeaders();

      const send = (type: string, data: unknown) => {
        const payload = Object.assign({ type }, data as object);
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      try {
        send('status', { message: 'Connecting to Qdrant…' });
        await ensureCollection();
        send('status', { message: 'Collection ready. Walking files…' });

        const allFiles = walkFiles(projectPath);
        send('status', { message: `Found ${allFiles.length} code files. Chunking…` });

        let totalChunks = 0;
        let indexed = 0;
        let pointId = force ? 0 : Date.now(); // use timestamp as base id when appending

        const BATCH = 10;
        const batch: Array<{ id: number; vector: number[]; payload: Record<string, unknown> }> = [];

        for (let fi = 0; fi < allFiles.length; fi++) {
          const chunks = chunkFile(allFiles[fi], projectPath);
          totalChunks += chunks.length;

          for (const chunk of chunks) {
            const vector = await embed(chunk.content);
            batch.push({
              id: pointId++,
              vector,
              payload: {
                file: chunk.file,
                startLine: chunk.startLine,
                endLine: chunk.endLine,
                content: chunk.content.slice(0, 800), // store snippet for retrieval
                projectPath,
              },
            });

            if (batch.length >= BATCH) {
              await upsertPoints([...batch]);
              indexed += batch.length;
              batch.length = 0;
              send('progress', { indexed, total: totalChunks, file: chunks[0]?.file });
            }
          }

          // Progress update per file
          if (fi % 5 === 0) {
            send('progress', { indexed, total: totalChunks, file: allFiles[fi] });
          }
        }

        // Flush remaining
        if (batch.length > 0) {
          await upsertPoints([...batch]);
          indexed += batch.length;
        }

        send('done', {
          indexed,
          files: allFiles.length,
          collection: COLLECTION,
          message: `Indexed ${indexed} chunks from ${allFiles.length} files into Qdrant.`,
        });
      } catch (err: any) {
        send('error', { message: err?.message ?? 'Unknown error during crawl' });
      } finally {
        reply.raw.end();
      }
    },
  );

  // Semantic search
  app.post<{
    Body: { query: string; projectPath?: string; limit?: number };
  }>(
    '/api/crawl/search',
    {
      schema: {
        body: {
          type: 'object',
          required: ['query'],
          properties: {
            query:       { type: 'string' },
            projectPath: { type: 'string' },
            limit:       { type: 'number' },
          },
        },
      },
    },
    async (req, reply) => {
      const { query, projectPath, limit = 8 } = req.body;

      try {
        const queryVec = await embed(query);

        const filter = projectPath
          ? { must: [{ key: 'projectPath', match: { value: projectPath } }] }
          : undefined;

        const result = await qdrantReq(`/collections/${COLLECTION}/points/search`, 'POST', {
          vector: queryVec,
          limit,
          filter,
          with_payload: true,
          score_threshold: 0.3,
        });

        const hits = (result?.result ?? []).map((h: any) => ({
          file:      h.payload?.file,
          startLine: h.payload?.startLine,
          endLine:   h.payload?.endLine,
          content:   h.payload?.content,
          score:     Math.round(h.score * 100) / 100,
        }));

        // Optional LLM summary
        let summary: string | undefined;
        if (hits.length > 0) {
          try {
            const context = hits.slice(0, 4).map((h: any) =>
              `${h.file}:${h.startLine}\n${h.content?.slice(0, 200)}`
            ).join('\n\n---\n\n');

            const resp = await execute([
              { role: 'system', content: 'You are a code search assistant. Summarize the relevant code snippets in 1-2 sentences.' },
              { role: 'user', content: `Query: "${query}"\n\nMatches:\n${context}` },
            ], { maxTokens: 150, temperature: 0.1 });

            summary = resp.content;
          } catch { /* optional */ }
        }

        return reply.send({ hits, total: hits.length, summary });
      } catch (err: any) {
        return reply.status(503).send({
          error: 'Qdrant not available',
          detail: err?.message,
          hint: `Start Qdrant: docker run -p 6333:6333 qdrant/qdrant`,
        });
      }
    },
  );
}

/**
 * /api/memory — Shared project memory / knowledge base
 *
 * All LLMs (orchestrator + executor) read from this memory to understand
 * the project context, decisions, and ongoing work. Any LLM or the user
 * can write new facts or update existing ones.
 *
 * Stored as JSON in ~/.lynx/memory/<projectHash>/entries.json
 *
 * GET  /api/memory          → list all entries (filtered by tags/type)
 * POST /api/memory          → add or update a memory entry
 * DELETE /api/memory/:id    → remove an entry
 * GET  /api/memory/context  → returns a formatted context string for LLM injection
 * POST /api/memory/search   → semantic search over memory entries
 */

import type { FastifyInstance } from 'fastify';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, createHash } from 'path';
import { execute } from '@lynx/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  type: 'fact' | 'decision' | 'task' | 'architecture' | 'person' | 'note' | 'error-pattern' | 'integration';
  title: string;
  content: string;
  tags: string[];
  source: string;        // 'user' | 'brain' | 'orchestrator' | 'executor' | 'scan'
  projectPath?: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;      // always included in LLM context
}

interface MemoryStore {
  entries: MemoryEntry[];
  version: number;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const BASE_DIR = process.env.HOME ? `${process.env.HOME}/.lynx/memory` : '/tmp/.lynx/memory';

function storePathFor(projectPath?: string): string {
  if (projectPath) {
    const hash = createHash('sha1').update(projectPath).digest('hex').slice(0, 8);
    return join(BASE_DIR, hash);
  }
  return join(BASE_DIR, 'global');
}

function loadStore(projectPath?: string): MemoryStore {
  const dir = storePathFor(projectPath);
  const file = join(dir, 'entries.json');
  try {
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  } catch { /* corrupt — start fresh */ }
  return { entries: [], version: 1 };
}

function saveStore(store: MemoryStore, projectPath?: string): void {
  const dir = storePathFor(projectPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'entries.json'), JSON.stringify(store, null, 2), 'utf8');
}

function generateId(): string {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Context formatter ────────────────────────────────────────────────────────

function formatMemoryContext(entries: MemoryEntry[], maxEntries = 20): string {
  if (entries.length === 0) return '';

  const pinned = entries.filter(e => e.pinned).slice(0, 5);
  const recent = entries.filter(e => !e.pinned)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, maxEntries - pinned.length);

  const all = [...pinned, ...recent];

  const lines = ['## Project Memory (shared context across all LLMs)\n'];
  const byType = new Map<string, MemoryEntry[]>();
  for (const e of all) {
    const list = byType.get(e.type) ?? [];
    list.push(e);
    byType.set(e.type, list);
  }

  for (const [type, typeEntries] of byType) {
    lines.push(`### ${type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, ' ')}`);
    for (const e of typeEntries) {
      lines.push(`**${e.title}**${e.pinned ? ' 📌' : ''}`);
      lines.push(e.content);
      if (e.tags.length > 0) lines.push(`_tags: ${e.tags.join(', ')}_`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  // List entries
  app.get<{
    Querystring: {
      projectPath?: string;
      type?: string;
      tag?: string;
      search?: string;
      limit?: string;
    };
  }>(
    '/api/memory',
    async (req, reply) => {
      const { projectPath, type, tag, search, limit = '50' } = req.query;
      const store = loadStore(projectPath);

      let entries = store.entries;
      if (type) entries = entries.filter(e => e.type === type);
      if (tag)  entries = entries.filter(e => e.tags.includes(tag));
      if (search) {
        const q = search.toLowerCase();
        entries = entries.filter(e =>
          e.title.toLowerCase().includes(q) ||
          e.content.toLowerCase().includes(q) ||
          e.tags.some(t => t.toLowerCase().includes(q))
        );
      }

      entries = entries
        .sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return b.updatedAt.localeCompare(a.updatedAt);
        })
        .slice(0, parseInt(limit, 10));

      return reply.send({ entries, total: entries.length });
    },
  );

  // Get formatted LLM context string
  app.get<{ Querystring: { projectPath?: string; maxEntries?: string } }>(
    '/api/memory/context',
    async (req, reply) => {
      const { projectPath, maxEntries = '20' } = req.query;
      const store = loadStore(projectPath);
      const context = formatMemoryContext(store.entries, parseInt(maxEntries, 10));
      return reply.send({ context, count: store.entries.length });
    },
  );

  // Semantic / keyword search
  app.post<{
    Body: {
      query: string;
      projectPath?: string;
      limit?: number;
    };
  }>(
    '/api/memory/search',
    async (req, reply) => {
      const { query, projectPath, limit = 10 } = req.body;
      const store = loadStore(projectPath);
      const q = query.toLowerCase();

      // Score each entry
      const scored = store.entries.map(e => {
        let score = 0;
        if (e.title.toLowerCase().includes(q)) score += 3;
        if (e.content.toLowerCase().includes(q)) score += 2;
        if (e.tags.some(t => t.toLowerCase().includes(q))) score += 2;
        if (e.type.includes(q)) score += 1;
        if (e.pinned) score += 0.5;
        return { entry: e, score };
      });

      const results = scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.entry);

      return reply.send({ results, total: results.length });
    },
  );

  // Add or update entry
  app.post<{
    Body: {
      id?: string;           // if provided, update existing
      type: MemoryEntry['type'];
      title: string;
      content: string;
      tags?: string[];
      source?: string;
      projectPath?: string;
      pinned?: boolean;
    };
  }>(
    '/api/memory',
    {
      schema: {
        body: {
          type: 'object',
          required: ['type', 'title', 'content'],
          properties: {
            id:          { type: 'string' },
            type:        { type: 'string' },
            title:       { type: 'string' },
            content:     { type: 'string' },
            tags:        { type: 'array', items: { type: 'string' } },
            source:      { type: 'string' },
            projectPath: { type: 'string' },
            pinned:      { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const { id, type, title, content, tags = [], source = 'user', projectPath, pinned = false } = req.body;
      const store = loadStore(projectPath);

      const now = new Date().toISOString();

      if (id) {
        // Update existing
        const idx = store.entries.findIndex(e => e.id === id);
        if (idx === -1) return reply.status(404).send({ error: 'Entry not found' });
        store.entries[idx] = { ...store.entries[idx], type, title, content, tags, source, pinned, updatedAt: now };
        saveStore(store, projectPath);
        return reply.send({ ok: true, entry: store.entries[idx] });
      }

      // Create new
      const entry: MemoryEntry = {
        id: generateId(),
        type,
        title,
        content,
        tags,
        source,
        projectPath,
        createdAt: now,
        updatedAt: now,
        pinned,
      };
      store.entries.push(entry);
      saveStore(store, projectPath);
      return reply.status(201).send({ ok: true, entry });
    },
  );

  // Delete entry
  app.delete<{ Params: { id: string }; Querystring: { projectPath?: string } }>(
    '/api/memory/:id',
    async (req, reply) => {
      const store = loadStore(req.query.projectPath);
      const before = store.entries.length;
      store.entries = store.entries.filter(e => e.id !== req.params.id);
      if (store.entries.length === before) return reply.status(404).send({ error: 'Not found' });
      saveStore(store, req.query.projectPath);
      return reply.send({ ok: true });
    },
  );

  // Auto-extract memory from Brain conversation (called by Brain after each session)
  app.post<{
    Body: {
      conversation: Array<{ role: string; content: string }>;
      projectPath?: string;
    };
  }>(
    '/api/memory/extract',
    async (req, reply) => {
      const { conversation, projectPath } = req.body;
      if (!conversation?.length) return reply.send({ ok: true, extracted: 0 });

      const summary = conversation
        .filter(m => m.role !== 'system')
        .slice(-10)
        .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 300)}`)
        .join('\n\n');

      try {
        const resp = await execute([
          {
            role: 'system',
            content: 'You are a memory extractor. From this conversation, extract 1-3 key facts, decisions, or insights worth remembering. Return JSON array: [{ "type": "fact|decision|task|architecture|note", "title": "short title", "content": "detail", "tags": ["tag1"] }]. Return ONLY valid JSON.',
          },
          { role: 'user', content: `Extract key memory items from:\n\n${summary}` },
        ], { maxTokens: 400, temperature: 0.1 });

        let extracted = 0;
        try {
          const text = resp.content ?? '';
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const items = JSON.parse(jsonMatch[0]) as Array<{
              type: MemoryEntry['type'];
              title: string;
              content: string;
              tags: string[];
            }>;

            const store = loadStore(projectPath);
            const now = new Date().toISOString();

            for (const item of items.slice(0, 3)) {
              if (!item.title || !item.content) continue;
              store.entries.push({
                id: generateId(),
                type: item.type ?? 'note',
                title: item.title,
                content: item.content,
                tags: item.tags ?? [],
                source: 'brain',
                projectPath,
                createdAt: now,
                updatedAt: now,
                pinned: false,
              });
              extracted++;
            }
            if (extracted > 0) saveStore(store, projectPath);
          }
        } catch { /* malformed JSON from LLM */ }

        return reply.send({ ok: true, extracted });
      } catch {
        return reply.send({ ok: true, extracted: 0, error: 'LLM unavailable' });
      }
    },
  );
}

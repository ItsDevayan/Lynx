/**
 * /api/integrations — External service integrations
 *
 * POST /api/integrations/notion/create-page  → create a page in Notion
 * POST /api/integrations/notion/search        → search Notion workspace
 * POST /api/integrations/slack/send           → send a message to a Slack channel
 * POST /api/integrations/discord/send         → send a message to a Discord webhook
 * POST /api/integrations/figma/inspect        → fetch Figma node context via MCP
 * POST /api/integrations/stitch/generate      → send design context to Stitch AI codegen
 * GET  /api/integrations/config               → return stored integration tokens (masked)
 * POST /api/integrations/config               → save integration tokens
 */

import type { FastifyInstance } from 'fastify';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// ─── Config store ──────────────────────────────────────────────────────────────

const CONFIG_DIR  = process.env.HOME ? `${process.env.HOME}/.lynx` : '/tmp/.lynx';
const CONFIG_FILE = join(CONFIG_DIR, 'integrations.json');

interface IntegrationsConfig {
  notion?:  { apiKey: string; defaultDatabase?: string };
  slack?:   { webhookUrl: string; defaultChannel?: string };
  discord?: { webhookUrl: string };
  figma?:   { accessToken: string };
  stitch?:  { apiKey: string; baseUrl?: string };
}

function loadIntegrationsConfig(): IntegrationsConfig {
  try {
    if (existsSync(CONFIG_FILE)) return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch { /* ignore */ }
  return {};
}

function saveIntegrationsConfig(cfg: IntegrationsConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

function maskToken(token: string): string {
  if (!token || token.length < 8) return '***';
  return token.slice(0, 4) + '…' + token.slice(-4);
}

// ─── Notion helpers ───────────────────────────────────────────────────────────

async function notionReq(path: string, method: string, apiKey: string, body?: unknown) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(`Notion ${method} ${path} → ${res.status}: ${(err as any).message ?? res.statusText}`);
  }
  return res.json();
}

// ─── Slack helpers ────────────────────────────────────────────────────────────

async function slackSend(webhookUrl: string, text: string, blocks?: unknown[]) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, ...(blocks ? { blocks } : {}) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Slack webhook → ${res.status}`);
  return { ok: true };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function integrationsRoutes(app: FastifyInstance): Promise<void> {
  // ── Config GET/POST ──────────────────────────────────────────────────────────

  app.get('/api/integrations/config', async (_, reply) => {
    const cfg = loadIntegrationsConfig();
    return reply.send({
      notion:  cfg.notion  ? { apiKey: maskToken(cfg.notion.apiKey),  defaultDatabase: cfg.notion.defaultDatabase,  connected: true } : { connected: false },
      slack:   cfg.slack   ? { webhookUrl: maskToken(cfg.slack.webhookUrl), defaultChannel: cfg.slack.defaultChannel, connected: true } : { connected: false },
      discord: cfg.discord ? { webhookUrl: maskToken(cfg.discord.webhookUrl), connected: true } : { connected: false },
      figma:   cfg.figma   ? { accessToken: maskToken(cfg.figma.accessToken), connected: true } : { connected: false },
      stitch:  cfg.stitch  ? { apiKey: maskToken(cfg.stitch.apiKey), baseUrl: cfg.stitch.baseUrl, connected: true } : { connected: false },
    });
  });

  app.post<{ Body: IntegrationsConfig }>(
    '/api/integrations/config',
    async (req, reply) => {
      const existing = loadIntegrationsConfig();
      const patch = req.body;

      // Merge: only overwrite keys that are provided and not masked
      const isMasked = (v: string) => v.includes('…') && v.length < 20;

      if (patch.notion?.apiKey && !isMasked(patch.notion.apiKey)) {
        existing.notion = { ...existing.notion, ...patch.notion };
      } else if (patch.notion?.defaultDatabase) {
        existing.notion = { ...existing.notion, defaultDatabase: patch.notion.defaultDatabase };
      }

      if (patch.slack?.webhookUrl && !isMasked(patch.slack.webhookUrl)) {
        existing.slack = { ...existing.slack, ...patch.slack };
      }
      if (patch.discord?.webhookUrl && !isMasked(patch.discord.webhookUrl)) {
        existing.discord = patch.discord;
      }
      if (patch.figma?.accessToken && !isMasked(patch.figma.accessToken)) {
        existing.figma = patch.figma;
      }
      if (patch.stitch?.apiKey && !isMasked(patch.stitch.apiKey)) {
        existing.stitch = { ...existing.stitch, ...patch.stitch };
      }

      saveIntegrationsConfig(existing);
      return reply.send({ ok: true });
    },
  );

  // ── Notion ───────────────────────────────────────────────────────────────────

  // Create a Notion page
  app.post<{
    Body: {
      title: string;
      content: string;
      databaseId?: string;
      parentPageId?: string;
      properties?: Record<string, unknown>;
    };
  }>(
    '/api/integrations/notion/create-page',
    async (req, reply) => {
      const cfg = loadIntegrationsConfig();
      if (!cfg.notion?.apiKey) return reply.status(400).send({ error: 'Notion not configured' });

      const { title, content, databaseId, parentPageId, properties } = req.body;
      const dbId = databaseId ?? cfg.notion.defaultDatabase;

      const parent = dbId
        ? { database_id: dbId }
        : parentPageId
          ? { page_id: parentPageId }
          : null;

      if (!parent) return reply.status(400).send({ error: 'Provide databaseId or parentPageId' });

      // Build blocks from markdown-ish content
      const blocks = content.split('\n').filter(Boolean).slice(0, 50).map(line => ({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: line.slice(0, 2000) } }],
        },
      }));

      try {
        const page = await notionReq('/pages', 'POST', cfg.notion.apiKey, {
          parent,
          properties: {
            title: { title: [{ text: { content: title } }] },
            ...(properties ?? {}),
          },
          children: blocks,
        });
        return reply.send({ ok: true, pageId: (page as any).id, url: (page as any).url });
      } catch (err: any) {
        return reply.status(500).send({ error: err?.message });
      }
    },
  );

  // Search Notion
  app.post<{ Body: { query: string; filter?: { value: string; property: string } } }>(
    '/api/integrations/notion/search',
    async (req, reply) => {
      const cfg = loadIntegrationsConfig();
      if (!cfg.notion?.apiKey) return reply.status(400).send({ error: 'Notion not configured' });

      try {
        const data = await notionReq('/search', 'POST', cfg.notion.apiKey, {
          query: req.body.query,
          filter: req.body.filter,
          page_size: 10,
        });
        const results = ((data as any).results ?? []).map((r: any) => ({
          id: r.id,
          type: r.object,
          title: r.properties?.title?.title?.[0]?.text?.content
              ?? r.properties?.Name?.title?.[0]?.text?.content
              ?? '(untitled)',
          url: r.url,
          lastEdited: r.last_edited_time,
        }));
        return reply.send({ results, total: results.length });
      } catch (err: any) {
        return reply.status(500).send({ error: err?.message });
      }
    },
  );

  // ── Slack ────────────────────────────────────────────────────────────────────

  app.post<{ Body: { text: string; channel?: string; blocks?: unknown[] } }>(
    '/api/integrations/slack/send',
    async (req, reply) => {
      const cfg = loadIntegrationsConfig();
      if (!cfg.slack?.webhookUrl) return reply.status(400).send({ error: 'Slack not configured' });

      try {
        await slackSend(cfg.slack.webhookUrl, req.body.text, req.body.blocks);
        return reply.send({ ok: true });
      } catch (err: any) {
        return reply.status(500).send({ error: err?.message });
      }
    },
  );

  // ── Discord ───────────────────────────────────────────────────────────────────

  app.post<{ Body: { content: string; username?: string; embeds?: unknown[] } }>(
    '/api/integrations/discord/send',
    async (req, reply) => {
      const cfg = loadIntegrationsConfig();
      if (!cfg.discord?.webhookUrl) return reply.status(400).send({ error: 'Discord not configured' });

      try {
        const res = await fetch(cfg.discord.webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            content: req.body.content,
            username: req.body.username ?? 'Lynx',
            embeds: req.body.embeds,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`Discord webhook → ${res.status}`);
        return reply.send({ ok: true });
      } catch (err: any) {
        return reply.status(500).send({ error: err?.message });
      }
    },
  );

  // ── Figma ─────────────────────────────────────────────────────────────────────

  app.post<{ Body: { fileKey: string; nodeId?: string } }>(
    '/api/integrations/figma/inspect',
    async (req, reply) => {
      const cfg = loadIntegrationsConfig();
      if (!cfg.figma?.accessToken) return reply.status(400).send({ error: 'Figma not configured' });

      const { fileKey, nodeId } = req.body;
      try {
        const url = nodeId
          ? `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`
          : `https://api.figma.com/v1/files/${fileKey}`;

        const res = await fetch(url, {
          headers: { 'X-Figma-Token': cfg.figma.accessToken },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return reply.status(res.status).send({ error: (err as any).err ?? res.statusText });
        }
        const data = await res.json();

        // Extract relevant design context
        const node = nodeId
          ? (data as any).nodes?.[nodeId]?.document
          : (data as any).document;

        const context = {
          name:     node?.name ?? data.name,
          type:     node?.type,
          children: node?.children?.slice(0, 20).map((c: any) => ({ name: c.name, type: c.type, id: c.id })),
          fills:    node?.fills,
          style:    node?.style,
        };

        return reply.send({ ok: true, context, raw: node });
      } catch (err: any) {
        return reply.status(500).send({ error: err?.message });
      }
    },
  );

  // ── Stitch ────────────────────────────────────────────────────────────────────
  // Stitch (https://stitches.dev / or AI Stitch) design-to-code generation
  // Accepts a design description or Figma node context and returns component code

  app.post<{
    Body: {
      designContext: string;   // description or serialized Figma node
      framework?: string;      // 'react' | 'vue' | 'html'
      styleSystem?: string;    // 'tailwind' | 'css-modules' | 'styled-components'
      figmaFileKey?: string;
      figmaNodeId?: string;
    };
  }>(
    '/api/integrations/stitch/generate',
    async (req, reply) => {
      const cfg = loadIntegrationsConfig();
      const { designContext, framework = 'react', styleSystem = 'tailwind', figmaFileKey, figmaNodeId } = req.body;

      // If Figma details provided and configured, fetch node context first
      let enrichedContext = designContext;
      if (figmaFileKey && cfg.figma?.accessToken) {
        try {
          const url = figmaNodeId
            ? `https://api.figma.com/v1/files/${figmaFileKey}/nodes?ids=${encodeURIComponent(figmaNodeId)}`
            : `https://api.figma.com/v1/files/${figmaFileKey}`;
          const res = await fetch(url, {
            headers: { 'X-Figma-Token': cfg.figma.accessToken },
            signal: AbortSignal.timeout(10_000),
          });
          if (res.ok) {
            const data = await res.json();
            const node = figmaNodeId
              ? (data as any).nodes?.[figmaNodeId]?.document
              : (data as any).document;
            enrichedContext = `${designContext}\n\nFigma node: ${JSON.stringify({ name: node?.name, type: node?.type, fills: node?.fills, style: node?.style }, null, 2).slice(0, 2000)}`;
          }
        } catch { /* use original context */ }
      }

      // If Stitch API key configured, use Stitch AI
      if (cfg.stitch?.apiKey) {
        try {
          const baseUrl = cfg.stitch.baseUrl ?? 'https://api.stitch.design';
          const res = await fetch(`${baseUrl}/v1/generate`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${cfg.stitch.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ designContext: enrichedContext, framework, styleSystem }),
            signal: AbortSignal.timeout(30_000),
          });
          if (res.ok) {
            const data = await res.json();
            return reply.send({ ok: true, source: 'stitch', code: (data as any).code, component: (data as any).component });
          }
        } catch { /* fall through to LLM */ }
      }

      // Fallback: use Lynx executor LLM
      try {
        const { execute } = await import('@lynx/core');
        const prompt = `Generate a ${framework} component with ${styleSystem} styling based on this design:

${enrichedContext}

Return ONLY the component code, no explanation. Use ${styleSystem} for styling.
Component should be production-ready, accessible, and responsive.`;

        const resp = await execute([
          { role: 'system', content: `You are a UI component generator. Generate ${framework} components from design descriptions. Use ${styleSystem} for styling. Return only code.` },
          { role: 'user', content: prompt },
        ], { maxTokens: 800, temperature: 0.2 });

        return reply.send({ ok: true, source: 'llm', code: resp.content });
      } catch (err: any) {
        return reply.status(503).send({ error: 'Code generation unavailable', detail: err?.message });
      }
    },
  );
}

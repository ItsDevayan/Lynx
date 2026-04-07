/**
 * /api/mesh — LLM Mesh routing endpoints
 *
 * POST /api/mesh/chat        → route a message through the conductor mesh
 * POST /api/mesh/classify    → classify task type without executing
 * POST /api/mesh/unload      → unload all models from RAM
 * GET  /api/mesh/status      → current mesh config + loaded models
 * POST /api/mesh/session     → manage session memory
 */

import type { FastifyInstance } from 'fastify';
import {
  initMesh,
  getMesh,
  addToSession,
  getSession,
  clearSession,
  LLMesh,
  recommendBundle,
  getLLMConfig,
  orchestrate,
  execute,
  type MeshMessage,
} from '@lynx/core';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import os from 'os';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadSavedConfig(): { bundleId?: string; useCase?: string; ram?: number } {
  const configFile = join(process.env.HOME ?? '/tmp', '.lynx', 'config.json');
  try {
    if (existsSync(configFile)) {
      const saved = JSON.parse(readFileSync(configFile, 'utf8'));
      return {
        bundleId: saved.executor?.bundleId,
        useCase:  saved.useCase,
      };
    }
  } catch { /* */ }
  return {};
}

let _systemContext: string | undefined;

function ensureMesh(systemContext?: string): LLMesh {
  // Update system context if provided
  if (systemContext) _systemContext = systemContext;

  let mesh = getMesh();
  if (mesh) return mesh;

  // Bootstrap from saved config
  const saved   = loadSavedConfig();
  const ramGb   = Math.floor(os.totalmem() / 1024 / 1024 / 1024);
  const profile = (saved.useCase ?? 'balanced') as any;
  const bundle  = recommendBundle(ramGb, 0, profile);

  mesh = initMesh(
    {
      bundle,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
      availableRamGb: ramGb,
      sessionTtlMs: 30 * 60 * 1000,
    },
    async (messages) => {
      // Conductor function — inject system context + use configured orchestrator
      const { orchestrate } = await import('@lynx/core');
      const withCtx = _systemContext
        ? [{ role: 'system' as const, content: _systemContext }, ...messages.filter(m => m.role !== 'system')]
        : messages;
      return orchestrate(withCtx as any, { tier: 'heavy' });
    },
  );

  return mesh;
}

// ─── SSE streaming helper ────────────────────────────────────────────────────

/** Stream a full text response as SSE word-chunks, then send a done event */
async function streamSSEResponse(
  reply: any,
  content: string,
  meta: Record<string, unknown>,
): Promise<void> {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('X-Accel-Buffering', 'no');

  const send = (data: object) => {
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Stream word by word with a small delay for visual effect
  const words = content.split(/(\s+)/);
  let accumulated = '';
  for (const word of words) {
    accumulated += word;
    send({ type: 'chunk', text: word });
    // Tiny yield so the event loop can flush
    await new Promise<void>(r => setImmediate(r));
  }

  send({ type: 'done', content, ...meta });
  reply.raw.end();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function meshRoutes(app: FastifyInstance): Promise<void> {

  // ── POST /api/mesh/chat ──────────────────────────────────────────────────
  app.post<{
    Body: {
      prompt: string;
      sessionId?: string;
      forceTask?: string;
      systemContext?: string;
      history?: Array<{ role: string; content: string }>;
      model?: string;   // per-request model override, e.g. "groq:deepseek-r1"
      stream?: boolean; // SSE streaming response
    };
  }>(
    '/api/mesh/chat',
    {
      schema: {
        body: {
          type: 'object',
          required: ['prompt'],
          properties: {
            prompt:        { type: 'string' },
            sessionId:     { type: 'string' },
            forceTask:     { type: 'string' },
            systemContext: { type: 'string' },
            history:       { type: 'array' },
            model:         { type: 'string' },
            stream:        { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const { prompt, sessionId, systemContext, history, model, stream } = req.body;

      try {
        const sid = sessionId ?? 'default';

        // ── Per-request model override ──────────────────────────────────────
        // When the user picks a specific model in Brain, bypass the global mesh
        // conductor and route directly to that provider.
        if (model && model !== 'default') {
          const [provider, modelId] = model.split(':') as [string, string | undefined];
          const baseCfg = getLLMConfig();

          let overrideCfg: Parameters<typeof orchestrate>[2];
          if (provider === 'ollama') {
            // Use executor directly for Ollama models
            const ollamaResp = await execute(
              [
                ...(systemContext ? [{ role: 'system' as const, content: systemContext }] : []),
                ...( history ?? []).slice(-10).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
                { role: 'user' as const, content: prompt },
              ],
              { maxTokens: 2048 },
            );
            const ollamaMeta = { ok: true, task: 'general', conductor: 'direct', specialist: `ollama:${modelId ?? 'default'}`, thinking: ollamaResp.thinking ?? null, sessionId: sid };
            if (stream) {
              await streamSSEResponse(reply, ollamaResp.content, ollamaMeta);
              return;
            }
            return reply.send({ ...ollamaMeta, content: ollamaResp.content });
          }

          // Cloud provider override
          overrideCfg = {
            orchestrator: {
              provider:     provider as any,
              groqModel:    provider === 'groq'       ? modelId : baseCfg.orchestrator.groqModel,
              claudeModel:  provider === 'claude-api' ? modelId : baseCfg.orchestrator.claudeModel,
              openaiModel:  provider === 'openai'     ? modelId : baseCfg.orchestrator.openaiModel,
              groqApiKey:   baseCfg.orchestrator.groqApiKey   ?? baseCfg.groqApiKey,
              anthropicApiKey: baseCfg.orchestrator.anthropicApiKey ?? baseCfg.anthropicApiKey,
              openaiApiKey: baseCfg.orchestrator.openaiApiKey ?? baseCfg.openaiApiKey,
            },
          };

          const msgs = [
            ...(systemContext ? [{ role: 'system' as const, content: systemContext }] : []),
            ...(history ?? []).slice(-10).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
            { role: 'user' as const, content: prompt },
          ];

          const resp = await orchestrate(msgs, { maxTokens: 2048 }, overrideCfg);
          const directMeta = { ok: true, task: 'general', conductor: 'direct', specialist: model, thinking: resp.thinking ?? null, sessionId: sid };
          if (stream) {
            await streamSSEResponse(reply, resp.content, directMeta);
            return;
          }
          return reply.send({ ...directMeta, content: resp.content });
        }

        // ── Normal mesh routing ─────────────────────────────────────────────
        const mesh = ensureMesh(systemContext);

        // Seed history into session memory if provided
        if (history && history.length > 0) {
          const existing = getSession(sid);
          if (existing.length === 0) {
            for (const h of history.slice(-10)) {
              addToSession(sid, { role: h.role as 'user' | 'assistant', content: h.content });
            }
          }
        }

        const response = await mesh.route(prompt);

        const meshMeta = {
          ok: true,
          task:          response.taskType,
          conductor:     response.conductor,
          specialist:    response.specialist,
          thinking:      response.thinking ?? null,
          isBottleneck:  response.isBottleneck,
          bottleneck:    response.bottleneckReason ?? null,
          executionMode: response.executionMode,
          stepsLog:      response.stepsLog,
          sessionId:     sid,
        };

        if (stream) {
          await streamSSEResponse(reply, response.content, meshMeta);
          return;
        }

        return reply.send({ ...meshMeta, content: response.content });
      } catch (err: any) {
        app.log.error(err, '[mesh] chat error');
        return reply.status(500).send({
          ok: false,
          error: err.message ?? 'Mesh routing failed',
          hint: 'Is Ollama running? Try: ollama serve',
        });
      }
    },
  );

  // ── POST /api/mesh/classify ──────────────────────────────────────────────
  app.post<{ Body: { prompt: string } }>(
    '/api/mesh/classify',
    {
      schema: {
        body: {
          type: 'object',
          required: ['prompt'],
          properties: { prompt: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      const mesh = ensureMesh();
      // Use the heuristic classifier without executing
      const task = (mesh as any).classifyHeuristic?.(req.body.prompt) ?? 'general';
      return reply.send({ task, prompt: req.body.prompt });
    },
  );

  // ── POST /api/mesh/unload ────────────────────────────────────────────────
  app.post('/api/mesh/unload', async (_, reply) => {
    const mesh = getMesh();
    if (mesh) {
      await mesh.unloadAll();
      return reply.send({ ok: true, message: 'All models unloaded from RAM' });
    }
    return reply.send({ ok: true, message: 'No mesh active' });
  });

  // ── GET /api/mesh/status ─────────────────────────────────────────────────
  app.get('/api/mesh/status', async (_, reply) => {
    const saved  = loadSavedConfig();
    const ramGb  = Math.floor(os.totalmem() / 1024 / 1024 / 1024);
    const mesh   = getMesh();
    const bundle = recommendBundle(ramGb, 0, (saved.useCase ?? 'balanced') as any);

    return reply.send({
      active:       !!mesh,
      bundleId:     saved.bundleId ?? bundle.id,
      bundleName:   bundle.name,
      useCase:      saved.useCase ?? 'balanced',
      ram:          ramGb,
      parallel:     ramGb >= bundle.parallelRamGb,
      ollamaUrl:    process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
      models: Object.fromEntries(
        Object.entries(bundle.models).map(([role, spec]) => [
          role,
          { name: spec?.name, tag: spec?.tag, ram: spec?.ramRequired },
        ]),
      ),
    });
  });

  // ── GET /api/mesh/session/:id ────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/mesh/session/:id',
    async (req, reply) => {
      const messages = getSession(req.params.id);
      return reply.send({ sessionId: req.params.id, messages, count: messages.length });
    },
  );

  // ── DELETE /api/mesh/session/:id ─────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/mesh/session/:id',
    async (req, reply) => {
      clearSession(req.params.id);
      return reply.send({ ok: true, sessionId: req.params.id });
    },
  );

  // ── POST /api/mesh/session/:id ────────────────────────────────────────────
  app.post<{
    Params: { id: string };
    Body: MeshMessage;
  }>(
    '/api/mesh/session/:id',
    {
      schema: {
        body: {
          type: 'object',
          required: ['role', 'content'],
          properties: {
            role:    { type: 'string', enum: ['user', 'assistant', 'system'] },
            content: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      addToSession(req.params.id, req.body);
      return reply.send({ ok: true });
    },
  );
}

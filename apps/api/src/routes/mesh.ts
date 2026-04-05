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

function ensureMesh(): LLMesh {
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
      // Conductor function — uses the configured orchestrator from llm-router
      const { orchestrate } = await import('@lynx/core');
      return orchestrate(messages, { tier: 'heavy' });
    },
  );

  return mesh;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function meshRoutes(app: FastifyInstance): Promise<void> {

  // ── POST /api/mesh/chat ──────────────────────────────────────────────────
  app.post<{
    Body: {
      prompt: string;
      sessionId?: string;
      forceTask?: string;
    };
  }>(
    '/api/mesh/chat',
    {
      schema: {
        body: {
          type: 'object',
          required: ['prompt'],
          properties: {
            prompt:    { type: 'string' },
            sessionId: { type: 'string' },
            forceTask: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { prompt, sessionId, forceTask } = req.body;

      try {
        const mesh = ensureMesh();
        const response = await mesh.route(prompt, sessionId, forceTask as any);

        return reply.send({
          ok: true,
          content: response.content,
          task:    response.task,
          model:   response.model,
          role:    response.role,
          thinking: response.thinking ?? null,
          sessionId: sessionId ?? 'default',
        });
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

/**
 * POST /api/chat — Brain chat endpoint (mesh-backed)
 *
 * Thin wrapper over /api/mesh/chat that accepts the simpler
 * { message, history } shape from the Brain page fallback.
 * Uses the same LLMesh singleton so context/session is shared.
 */

import type { FastifyInstance } from 'fastify';
import { getMesh, initMesh, addToSession, getSession, recommendBundle, orchestrate } from '@lynx/core';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import os from 'os';

function loadSavedConfig(): { bundleId?: string; useCase?: string } {
  const configFile = join(process.env.HOME ?? '/tmp', '.lynx', 'config.json');
  try {
    if (existsSync(configFile)) {
      const saved = JSON.parse(readFileSync(configFile, 'utf8'));
      return { bundleId: saved.executor?.bundleId, useCase: saved.useCase };
    }
  } catch { /* */ }
  return {};
}

function ensureMesh() {
  let mesh = getMesh();
  if (mesh) return mesh;
  const saved  = loadSavedConfig();
  const ramGb  = Math.floor(os.totalmem() / 1024 / 1024 / 1024);
  const bundle = recommendBundle(ramGb, 0, (saved.useCase ?? 'balanced') as any);
  mesh = initMesh(
    { bundle, ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434', availableRamGb: ramGb },
    async (messages) => orchestrate(messages as any, { tier: 'heavy' }),
  );
  return mesh;
}

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: {
      message: string;
      history?: Array<{ role: string; content: string }>;
      sessionId?: string;
    };
  }>(
    '/api/chat',
    {
      schema: {
        body: {
          type: 'object',
          required: ['message'],
          properties: {
            message:   { type: 'string', maxLength: 4000 },
            history:   { type: 'array' },
            sessionId: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { message, history = [], sessionId = 'default' } = req.body;

      try {
        const mesh = ensureMesh();
        const sid  = sessionId;

        // Seed history into session if first message
        if (history.length > 0 && getSession(sid).length === 0) {
          for (const h of history.slice(-10)) {
            addToSession(sid, { role: h.role as 'user' | 'assistant', content: h.content });
          }
        }

        const response = await mesh.route(message);

        return reply.send({
          content:    response.content,
          thinking:   response.thinking ?? null,
          model:      response.specialist,
          task:       response.taskType,
          conductor:  response.conductor,
          specialist: response.specialist,
          stepsLog:   response.stepsLog,
        });
      } catch (err) {
        app.log.warn(err, '[chat] mesh failed, trying direct orchestrate');
        // Last-resort fallback: direct orchestrate without mesh
        try {
          const msgs = [
            { role: 'system' as const, content: 'You are Lynx, an AI engineering partner. Always show your reasoning.' },
            ...history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
            { role: 'user' as const, content: message },
          ];
          const resp = await orchestrate(msgs, { tier: 'heavy' });
          return reply.send({ content: resp.content, thinking: resp.thinking, model: resp.model });
        } catch (err2) {
          return reply.status(500).send({
            error: `Brain unavailable: ${err2}. Configure GROQ_API_KEY or start Ollama.`,
          });
        }
      }
    },
  );
}

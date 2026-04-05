/**
 * POST /api/chat — Brain chat endpoint
 * Stub for Phase 1. Full LangGraph CEO agent wired in Phase 2 (packages/brain).
 */

import type { FastifyInstance } from 'fastify';
import { chat } from '@lynx/core';

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { message: string; history?: Array<{ role: string; content: string }> } }>(
    '/api/chat',
    {
      schema: {
        body: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string', maxLength: 4000 },
            history: { type: 'array' },
          },
        },
      },
    },
    async (req, reply) => {
      const { message, history = [] } = req.body;

      try {
        const messages = [
          {
            role: 'system' as const,
            content:
              'You are Lynx, an AI engineering partner. You help developers understand their codebase, debug errors, review security, and make architectural decisions. Always show your reasoning before your answer.',
          },
          ...history.map((h) => ({
            role: h.role as 'user' | 'assistant',
            content: h.content,
          })),
          { role: 'user' as const, content: message },
        ];

        const response = await chat(messages, { tier: 'normal' });

        return reply.send({
          content: response.content,
          thinking: response.thinking,
          model: response.model,
        });
      } catch (err) {
        return reply.status(500).send({
          error: `Brain unavailable: ${err}. Configure GROQ_API_KEY or start Ollama.`,
        });
      }
    },
  );
}

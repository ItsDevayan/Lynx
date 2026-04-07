/**
 * Lynx API — Fastify server
 *
 * Starts HTTP + WebSocket server.
 * Registers all route plugins.
 * Runs DB migrations on first boot.
 */

import 'dotenv/config';
import { existsSync, readFileSync } from 'fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { runMigrations } from './db/migrate.js';
import { closePool } from './db/pg.js';
import { RetentionService } from '@lynx/monitor';
import { PgEventStore, PgErrorTrackerStore } from './db/stores.js';
import { configureLLM } from '@lynx/core';
import { wsClients } from './ws-registry.js';

// Routes
import { healthRoutes } from './routes/health.js';
import { ingestRoutes } from './routes/ingest.js';
import { monitorRoutes } from './routes/monitor.js';
import { hitlRoutes } from './routes/hitl.js';
import { chatRoutes } from './routes/chat.js';
import { setupRoutes } from './routes/setup.js';
import { meshRoutes } from './routes/mesh.js';
import { filesRoutes } from './routes/files.js';
import { testsRoutes } from './routes/tests.js';
import { securityRoutes } from './routes/security.js';
import { scoutRoutes } from './routes/scout.js';
import { crawlRoutes } from './routes/crawl.js';
import { gitRoutes } from './routes/git.js';
import { integrationsRoutes } from './routes/integrations.js';
import { memoryRoutes } from './routes/memory.js';
import { webhooksRoutes } from './routes/webhooks.js';

const PORT = parseInt(process.env.API_PORT ?? '4000', 10);
const HOST = process.env.API_HOST ?? '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET ?? 'lynx-dev-secret-change-in-prod';

function loadSavedLLMConfig(): void {
  // Apply saved wizard config (~/.lynx/config.json) first, then env overrides
  const configFile = `${process.env.HOME ?? '/tmp'}/.lynx/config.json`;
  try {
    if (existsSync(configFile)) {
      const saved = JSON.parse(readFileSync(configFile, 'utf8'));
      const o = saved.orchestrator as { provider: string; apiKey?: string } | undefined;
      const e = saved.executor as { provider: string; model?: string; baseUrl?: string } | undefined;
      if (o || e) {
        configureLLM({
          orchestrator: o ? {
            provider: o.provider as any,
            groqApiKey: o.provider === 'groq' ? o.apiKey : undefined,
            anthropicApiKey: o.provider === 'claude-api' ? o.apiKey : undefined,
            openaiApiKey: o.provider === 'openai' ? o.apiKey : undefined,
          } : undefined,
          executor: e ? { provider: e.provider as any, model: e.model, baseUrl: e.baseUrl } : undefined,
        } as any);
      }
    }
  } catch { /* no saved config */ }

  // .env overrides
  configureLLM({
    groqApiKey: process.env.GROQ_API_KEY,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
  });
}

async function start(): Promise<void> {
  loadSavedLLMConfig();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // Plugins
  await app.register(cors, {
    origin: process.env.DASHBOARD_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  await app.register(jwt, { secret: JWT_SECRET });

  await app.register(websocket);

  // WebSocket endpoint — real-time push
  app.get('/ws', { websocket: true }, (socket) => {
    wsClients.add(socket);

    socket.on('message', (msg: Buffer | string) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }));
        }
      } catch { /* ignore malformed */ }
    });

    socket.on('close', () => wsClients.delete(socket));
    socket.on('error', () => wsClients.delete(socket));

    socket.send(JSON.stringify({ type: 'connected', message: 'Lynx WS ready' }));
  });

  // Routes
  await app.register(healthRoutes);
  await app.register(ingestRoutes);
  await app.register(monitorRoutes);
  await app.register(hitlRoutes);
  await app.register(chatRoutes);
  await app.register(setupRoutes);
  await app.register(meshRoutes);
  await app.register(filesRoutes);
  await app.register(testsRoutes);
  await app.register(securityRoutes);
  await app.register(scoutRoutes);
  await app.register(crawlRoutes);
  await app.register(gitRoutes);
  await app.register(integrationsRoutes);
  await app.register(memoryRoutes);
  await app.register(webhooksRoutes);

  // Run migrations
  await runMigrations();

  // Start retention service
  const retention = new RetentionService(
    new PgEventStore(),
    new PgErrorTrackerStore(),
  );
  retention.start();

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`[lynx:api] ${signal} received — shutting down`);
    retention.stop();
    await app.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`[lynx:api] Listening on http://${HOST}:${PORT}`);
}

start().catch((err) => {
  console.error('[lynx:api] Fatal startup error:', err);
  process.exit(1);
});

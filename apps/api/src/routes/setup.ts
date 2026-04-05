/**
 * /api/setup — Onboarding helpers
 *
 * GET  /api/setup/system-info     → RAM, GPU VRAM, model recommendations
 * POST /api/setup/detect-project  → detect framework from path
 * POST /api/setup/config          → save user config (persisted in db/file)
 * GET  /api/setup/config          → read current config
 */

import type { FastifyInstance } from 'fastify';
import os from 'os';
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { configureLLM } from '@lynx/core';

// ─── Model recommendations based on RAM ──────────────────────────────────────

interface ModelRec {
  tag: string;
  name: string;
  reason: string;
  ramRequired: string;
}

function getModelRecommendations(ramGb: number, vramGb?: number): ModelRec[] {
  if ((vramGb ?? 0) >= 24 || ramGb >= 64) {
    return [
      { tag: 'qwen2.5:32b-instruct-q4_K_M',    name: 'Qwen 2.5 32B',    reason: 'Best code quality, handles complex refactors',           ramRequired: '20GB' },
      { tag: 'codellama:34b-instruct-q4_K_M',   name: 'CodeLlama 34B',   reason: 'Specialized for code generation and analysis',           ramRequired: '22GB' },
      { tag: 'qwen2.5:14b-instruct-q4_K_M',     name: 'Qwen 2.5 14B',    reason: 'Fast and capable, excellent for daily use',             ramRequired: '10GB' },
    ];
  }
  if (ramGb >= 16) {
    return [
      { tag: 'qwen2.5:14b-instruct-q4_K_M',     name: 'Qwen 2.5 14B',    reason: 'Best model for your RAM — strong coding, reasoning',     ramRequired: '10GB' },
      { tag: 'deepseek-coder-v2:16b-lite-q4_K_M', name: 'DeepSeek Coder', reason: 'Top-tier for code review and generation',               ramRequired: '10GB' },
      { tag: 'mistral:7b-instruct-q4_K_M',       name: 'Mistral 7B',      reason: 'Fastest option, good general quality',                  ramRequired: '5GB'  },
    ];
  }
  if (ramGb >= 8) {
    return [
      { tag: 'mistral:7b-instruct-q4_K_M',       name: 'Mistral 7B',      reason: 'Best quality for your RAM, widely tested',             ramRequired: '5GB'  },
      { tag: 'qwen2.5:7b-instruct-q4_K_M',       name: 'Qwen 2.5 7B',     reason: 'Excellent code understanding, lightweight',            ramRequired: '5GB'  },
      { tag: 'phi3.5:3.8b-mini-instruct-q4_K_M', name: 'Phi-3.5 Mini',    reason: 'Fastest, fits comfortably in 4GB',                     ramRequired: '3GB'  },
    ];
  }
  return [
    { tag: 'phi3.5:3.8b-mini-instruct-q4_K_M',   name: 'Phi-3.5 Mini',    reason: 'Lightweight, runs on low RAM',                        ramRequired: '3GB'  },
    { tag: 'gemma2:2b-instruct-q4_K_M',           name: 'Gemma 2 2B',      reason: 'Smallest model, minimal resource use',                ramRequired: '2GB'  },
  ];
}

function detectGpuVram(): number | undefined {
  try {
    const out = execSync('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null', { timeout: 3000 }).toString().trim();
    const mb = parseInt(out.split('\n')[0], 10);
    return isNaN(mb) ? undefined : Math.floor(mb / 1024);
  } catch { return undefined; }
}

// ─── Project type detection ───────────────────────────────────────────────────

function detectProjectType(dir: string): string {
  if (!existsSync(dir)) return 'unknown';

  const checks: [string, string][] = [
    ['package.json', 'node'],
    ['pyproject.toml', 'python'],
    ['requirements.txt', 'python'],
    ['Cargo.toml', 'rust'],
    ['go.mod', 'go'],
    ['pom.xml', 'java'],
    ['build.gradle', 'java'],
    ['*.csproj', 'dotnet'],
    ['composer.json', 'php'],
    ['Gemfile', 'ruby'],
  ];

  for (const [file, type] of checks) {
    if (existsSync(join(dir, file))) {
      // Refine node type
      if (type === 'node') {
        try {
          const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
          if (pkg.dependencies?.next || pkg.devDependencies?.next) return 'next.js';
          if (pkg.dependencies?.react || pkg.devDependencies?.react) return 'react';
          if (pkg.dependencies?.vue || pkg.devDependencies?.vue) return 'vue';
          if (pkg.dependencies?.express) return 'express';
          if (pkg.dependencies?.fastify) return 'fastify';
          if (pkg.dependencies?.nestjs || pkg.dependencies?.['@nestjs/core']) return 'nestjs';
        } catch { /* */ }
        return 'node';
      }
      return type;
    }
  }
  return 'unknown';
}

// ─── Config file path ─────────────────────────────────────────────────────────

const CONFIG_DIR  = join(process.env.HOME ?? '/tmp', '.lynx');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function loadConfig(): Record<string, unknown> {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch { /* */ }
  return {};
}

function saveConfig(cfg: Record<string, unknown>): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function setupRoutes(app: FastifyInstance): Promise<void> {
  // System info + model recommendations
  app.get('/api/setup/system-info', async (_, reply) => {
    const ramBytes = os.totalmem();
    const ramGb    = Math.floor(ramBytes / 1024 / 1024 / 1024);
    const gpuVram  = detectGpuVram();

    return reply.send({
      ram: ramGb,
      gpuVram,
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      recommendations: getModelRecommendations(ramGb, gpuVram),
    });
  });

  // Project detection
  app.post<{ Body: { path: string } }>(
    '/api/setup/detect-project',
    {
      schema: {
        body: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } },
      },
    },
    async (req, reply) => {
      const { path } = req.body;
      const type = detectProjectType(path);
      return reply.send({ type, path, exists: existsSync(path) });
    },
  );

  // Save config + apply LLM config live
  app.post<{ Body: Record<string, unknown> }>(
    '/api/setup/config',
    { schema: { body: { type: 'object' } } },
    async (req, reply) => {
      const cfg = req.body as {
        orchestrator?: { provider: string; apiKey?: string; model?: string };
        executor?: { provider: string; model?: string; baseUrl?: string };
      };
      saveConfig(req.body);

      // Apply two-tier LLM config immediately so API routes work without restart
      if (cfg.orchestrator || cfg.executor) {
        configureLLM({
          orchestrator: cfg.orchestrator ? {
            provider: cfg.orchestrator.provider as any,
            groqApiKey: cfg.orchestrator.provider === 'groq' ? cfg.orchestrator.apiKey : undefined,
            anthropicApiKey: cfg.orchestrator.provider === 'claude-api' ? cfg.orchestrator.apiKey : undefined,
            openaiApiKey: cfg.orchestrator.provider === 'openai' ? cfg.orchestrator.apiKey : undefined,
          } : undefined,
          executor: cfg.executor ? {
            provider: cfg.executor.provider as any,
            model: cfg.executor.model,
            baseUrl: cfg.executor.baseUrl,
          } : undefined,
        } as any);
      }

      return reply.send({ ok: true });
    },
  );

  // Read config
  app.get('/api/setup/config', async (_, reply) => {
    return reply.send(loadConfig());
  });

  // Browse directory (for autocomplete in path input)
  app.get<{ Querystring: { path?: string } }>(
    '/api/setup/browse',
    async (req, reply) => {
      const dir = req.query.path ?? process.env.HOME ?? '/';
      const expanded = dir.replace(/^~/, process.env.HOME ?? '');
      try {
        const entries = readdirSync(expanded, { withFileTypes: true })
          .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
          .slice(0, 30)
          .map((e) => ({ name: e.name, path: join(expanded, e.name) }));
        return reply.send({ entries, current: expanded });
      } catch {
        return reply.status(400).send({ entries: [], current: dir, error: 'Cannot read directory' });
      }
    },
  );
}

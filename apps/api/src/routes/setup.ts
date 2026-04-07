/**
 * /api/setup — Onboarding helpers
 *
 * GET  /api/setup/system-info     → RAM, GPU VRAM, model recommendations
 * POST /api/setup/detect-project  → detect framework from path
 * POST /api/setup/config          → save user config (persisted in db/file)
 * GET  /api/setup/config          → read current config
 * POST /api/setup/provision       → SSE stream: model downloads + env checks
 * POST /api/setup/scan            → deep project structure scan
 */

import type { FastifyInstance } from 'fastify';
import os from 'os';
import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
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

// ─── Bundle → model tags map ─────────────────────────────────────────────────

const BUNDLE_MODELS: Record<string, Array<{ tag: string; name: string; role: string }>> = {
  'minimal':                 [{ tag: 'phi3.5:3.8b-mini-instruct-q4_K_M',    name: 'Phi-3.5 Mini 3.8B',    role: 'general' },
                              { tag: 'qwen2.5-coder:3b-instruct-q4_K_M',    name: 'Qwen 2.5 Coder 3B',   role: 'coder' },
                              { tag: 'deepseek-r1:8b-q4_K_M',               name: 'DeepSeek R1 8B',       role: 'reasoner' }],
  'standard':                [{ tag: 'llama3.1:8b-instruct-q4_K_M',         name: 'Llama 3.1 8B',         role: 'general' },
                              { tag: 'qwen2.5-coder:7b-instruct-q4_K_M',    name: 'Qwen 2.5 Coder 7B',   role: 'coder' },
                              { tag: 'deepseek-r1:14b-q4_K_M',              name: 'DeepSeek R1 14B',      role: 'reasoner' }],
  'workstation':             [{ tag: 'llama3.1:8b-instruct-q4_K_M',         name: 'Llama 3.1 8B',         role: 'general' },
                              { tag: 'qwen2.5-coder:14b-instruct-q4_K_M',   name: 'Qwen 2.5 Coder 14B',  role: 'coder' },
                              { tag: 'deepseek-r1:14b-q4_K_M',              name: 'DeepSeek R1 14B',      role: 'reasoner' }],
  'power-cpu':               [{ tag: 'llama3.1:8b-instruct-q4_K_M',         name: 'Llama 3.1 8B',         role: 'general' },
                              { tag: 'qwen2.5-coder:32b-instruct-q4_K_M',   name: 'Qwen 2.5 Coder 32B',  role: 'coder' },
                              { tag: 'qwq:32b-q4_K_M',                      name: 'QwQ 32B',              role: 'reasoner' }],
  'general-only':            [{ tag: 'llama3.2:3b-instruct-q4_K_M',         name: 'Llama 3.2 3B',         role: 'general' },
                              { tag: 'deepseek-r1:7b-q4_K_M',               name: 'DeepSeek R1 7B',       role: 'reasoner' }],
  'creative-studio':         [{ tag: 'llama3.1:8b-instruct-q4_K_M',         name: 'Llama 3.1 8B',         role: 'general' },
                              { tag: 'gemma3:12b-it-q4_K_M',                name: 'Gemma 3 12B',          role: 'creative' },
                              { tag: 'deepseek-r1:7b-q4_K_M',               name: 'DeepSeek R1 7B',       role: 'reasoner' }],
  'creative-studio-lite':    [{ tag: 'llama3.2:3b-instruct-q4_K_M',         name: 'Llama 3.2 3B',         role: 'general' },
                              { tag: 'llama3.1:8b-instruct-q4_K_M',         name: 'Llama 3.1 8B',         role: 'creative' }],
  'gpu-consumer':            [{ tag: 'llama3.3:70b-instruct-q4_K_M',        name: 'Llama 3.3 70B',        role: 'general' },
                              { tag: 'qwen2.5-coder:32b-instruct-q4_K_M',   name: 'Qwen 2.5 Coder 32B',  role: 'coder' },
                              { tag: 'deepseek-r1:32b-q4_K_M',              name: 'DeepSeek R1 32B',      role: 'reasoner' }],
  'gpu-workstation':         [{ tag: 'qwen2.5:72b-instruct-q4_K_M',         name: 'Qwen 2.5 72B',         role: 'general' },
                              { tag: 'qwen2.5-coder:32b-instruct-q4_K_M',   name: 'Qwen 2.5 Coder 32B',  role: 'coder' },
                              { tag: 'deepseek-r1:70b-q4_K_M',              name: 'DeepSeek R1 70B',      role: 'reasoner' }],
  'gpu-datacenter':          [{ tag: 'llama3.1:405b-instruct-q4_K_M',       name: 'Llama 3.1 405B',       role: 'general' },
                              { tag: 'qwen2.5-coder:32b-instruct-q4_K_M',   name: 'Qwen 2.5 Coder 32B',  role: 'coder' },
                              { tag: 'deepseek-r1:70b-q4_K_M',              name: 'DeepSeek R1 70B',      role: 'reasoner' }],
};

// ─── Project scanner ──────────────────────────────────────────────────────────

const LANG_EXTENSIONS: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
  '.py': 'Python', '.rs': 'Rust', '.go': 'Go', '.java': 'Java', '.cs': 'C#',
  '.rb': 'Ruby', '.php': 'PHP', '.cpp': 'C++', '.c': 'C', '.swift': 'Swift',
  '.kt': 'Kotlin', '.scala': 'Scala', '.ex': 'Elixir', '.hs': 'Haskell',
};

interface ScanResult {
  files: number;
  testFiles: number;
  primaryLanguage: string;
  framework: string;
  testFramework?: string;
  topDirs: string[];
  languageBreakdown: Record<string, number>;
  entryPoints: string[];
  packageName?: string;
  testFilePaths?: string[];
}

const IGNORED_SCAN = new Set(['node_modules', '__pycache__', 'target', '.git', 'dist', 'build', '.next', '.turbo', 'out', 'coverage']);

function detectTestFramework(dir: string): string {
  try {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const all = { ...pkg.dependencies, ...pkg.devDependencies };
      if (all.vitest)   return 'vitest';
      if (all.jest)     return 'jest';
      if (all.mocha)    return 'mocha';
      if (all.jasmine)  return 'jasmine';
    }
  } catch { /* */ }
  // Language-based fallback
  if (existsSync(join(dir, 'pytest.ini')) || existsSync(join(dir, 'setup.cfg'))) return 'pytest';
  if (existsSync(join(dir, 'Cargo.toml'))) return 'cargo';
  if (existsSync(join(dir, 'go.mod'))) return 'go';
  return 'unknown';
}

function scanProject(dir: string, maxDepth = 4): ScanResult {
  let fileCount = 0;
  const langCounts: Record<string, number> = {};
  const topDirs: string[] = [];
  const entryPoints: string[] = [];
  const testFilePaths: string[] = [];
  let packageName: string | undefined;

  // Read top-level dirs
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.') && !IGNORED_SCAN.has(e.name)) {
        topDirs.push(e.name);
      }
    }
  } catch { /* skip */ }

  // Count files recursively
  function walk(path: string, depth: number) {
    if (depth > maxDepth) return;
    try {
      const entries = readdirSync(path, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        if (IGNORED_SCAN.has(e.name)) continue;
        const full = join(path, e.name);
        if (e.isDirectory()) {
          walk(full, depth + 1);
        } else {
          fileCount++;
          const ext = extname(e.name).toLowerCase();
          const lang = LANG_EXTENSIONS[ext];
          if (lang) langCounts[lang] = (langCounts[lang] ?? 0) + 1;
          if (
            /\.(test|spec)\.(ts|tsx|js|jsx|py|rs|go)$/.test(e.name) ||
            e.name.includes('_test.') ||
            /^test_/.test(e.name) ||
            path.includes('__tests__') ||
            path.includes('/test/') ||
            path.includes('/tests/')
          ) {
            testFilePaths.push(full.replace(dir, '').replace(/^[/\\]/, ''));
          }
          if (['index.ts', 'index.js', 'main.ts', 'main.js', 'main.py', 'main.rs', 'main.go', 'app.ts', 'app.js'].includes(e.name)) {
            entryPoints.push(e.name);
          }
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  walk(dir, 0);

  // Detect package name
  try {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      packageName = pkg.name;
    }
  } catch { /* skip */ }

  const primaryLanguage = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Unknown';
  const framework = detectProjectType(dir);
  const testFramework = detectTestFramework(dir);

  return {
    files: fileCount,
    testFiles: testFilePaths.length,
    primaryLanguage,
    framework,
    testFramework,
    topDirs: topDirs.slice(0, 8),
    languageBreakdown: langCounts,
    entryPoints: entryPoints.slice(0, 3),
    packageName,
    testFilePaths: testFilePaths.slice(0, 100),
  };
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

  // ─── Test orchestrator connection ──────────────────────────────────────────
  // Validates an API key or spawns a CLI tool and verifies it responds.

  app.post<{ Body: { provider: string; apiKey?: string } }>(
    '/api/setup/test-orchestrator',
    { schema: { body: { type: 'object', required: ['provider'] } } },
    async (req, reply) => {
      const { provider, apiKey } = req.body;

      // ── Cloud API providers: make a minimal chat request ──
      if (provider === 'groq') {
        if (!apiKey) return reply.send({ ok: false, error: 'API key required' });
        try {
          const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'ping' }], max_tokens: 4 }),
            signal: AbortSignal.timeout(10_000),
          });
          if (r.ok) return reply.send({ ok: true, detail: 'Groq API key valid · llama-3.3-70b-versatile' });
          const err = await r.json().catch(() => ({})) as { error?: { message?: string } };
          return reply.send({ ok: false, error: err?.error?.message ?? `HTTP ${r.status}` });
        } catch (e) {
          return reply.send({ ok: false, error: String(e) });
        }
      }

      if (provider === 'openai') {
        if (!apiKey) return reply.send({ ok: false, error: 'API key required' });
        try {
          const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'ping' }], max_tokens: 4 }),
            signal: AbortSignal.timeout(10_000),
          });
          if (r.ok) return reply.send({ ok: true, detail: 'OpenAI key valid · gpt-4o' });
          const err = await r.json().catch(() => ({})) as { error?: { message?: string } };
          return reply.send({ ok: false, error: err?.error?.message ?? `HTTP ${r.status}` });
        } catch (e) {
          return reply.send({ ok: false, error: String(e) });
        }
      }

      if (provider === 'claude-api') {
        if (!apiKey) return reply.send({ ok: false, error: 'API key required' });
        try {
          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({ model: 'claude-3-5-sonnet-20241022', max_tokens: 4, messages: [{ role: 'user', content: 'ping' }] }),
            signal: AbortSignal.timeout(10_000),
          });
          if (r.ok) return reply.send({ ok: true, detail: 'Anthropic key valid · claude-3-5-sonnet' });
          const err = await r.json().catch(() => ({})) as { error?: { message?: string } };
          return reply.send({ ok: false, error: err?.error?.message ?? `HTTP ${r.status}` });
        } catch (e) {
          return reply.send({ ok: false, error: String(e) });
        }
      }

      if (provider === 'gemini') {
        if (!apiKey) return reply.send({ ok: false, error: 'API key required' });
        try {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
            signal: AbortSignal.timeout(10_000),
          });
          if (r.ok) return reply.send({ ok: true, detail: 'Gemini key valid · gemini-2.0-flash' });
          const err = await r.json().catch(() => ({})) as { error?: { message?: string } };
          return reply.send({ ok: false, error: err?.error?.message ?? `HTTP ${r.status}` });
        } catch (e) {
          return reply.send({ ok: false, error: String(e) });
        }
      }

      // ── CLI providers: spawn and check for a response ──
      const CLI_COMMANDS: Record<string, { cmd: string; args: string[]; successPattern: RegExp }> = {
        'claude-cli': { cmd: 'claude', args: ['--version'],        successPattern: /claude/i },
        'codex':      { cmd: 'codex',  args: ['--version'],        successPattern: /codex/i  },
        'gemini-cli': { cmd: 'gemini', args: ['--version'],        successPattern: /gemini/i },
        'aider':      { cmd: 'aider',  args: ['--version'],        successPattern: /aider/i  },
      };

      const cliDef = CLI_COMMANDS[provider];
      if (cliDef) {
        return new Promise<void>((resolve) => {
          let output = '';
          const proc = spawn(cliDef.cmd, cliDef.args, { shell: true });

          proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
          proc.stderr.on('data', (d: Buffer) => { output += d.toString(); });

          proc.on('close', (code) => {
            if (code === 0 || cliDef.successPattern.test(output)) {
              reply.send({ ok: true, detail: `${cliDef.cmd} found — ${output.trim().split('\n')[0]}` });
            } else {
              reply.send({ ok: false, error: `${cliDef.cmd} not found or not logged in. Run: ${cliDef.cmd} login` });
            }
            resolve();
          });

          proc.on('error', () => {
            reply.send({ ok: false, error: `${cliDef.cmd} not installed. Install it first, then come back.` });
            resolve();
          });

          setTimeout(() => {
            proc.kill();
            reply.send({ ok: false, error: `${cliDef.cmd} timed out` });
            resolve();
          }, 8_000);
        });
      }

      // Ollama — just check it's running
      if (provider === 'ollama') {
        try {
          const r = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3_000) });
          if (r.ok) {
            const data = await r.json() as { models?: unknown[] };
            return reply.send({ ok: true, detail: `Ollama running · ${data.models?.length ?? 0} models` });
          }
          return reply.send({ ok: false, error: 'Ollama not responding. Run: ollama serve' });
        } catch {
          return reply.send({ ok: false, error: 'Ollama not running. Install from ollama.ai then run: ollama serve' });
        }
      }

      return reply.send({ ok: true, detail: 'No verification needed' });
    },
  );

  // ─── Provision — SSE stream: env checks + model downloads ──────────────────

  app.post<{ Body: { executorProvider: string; bundleId?: string; projectPath?: string; orchestratorProvider?: string } }>(
    '/api/setup/provision',
    { schema: { body: { type: 'object', required: ['executorProvider'] } } },
    async (req, reply) => {
      const { executorProvider, bundleId, projectPath, orchestratorProvider } = req.body;

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const send = (data: object) => {
        try { reply.raw.write(`data: ${JSON.stringify(data)}\n\n`); } catch { /* client gone */ }
      };

      const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

      // ── Stage 1: Environment checks ──
      send({ type: 'stage', stage: 'check' });
      await delay(400);

      // Check Ollama if local executor selected
      if (executorProvider === 'ollama') {
        try {
          const ollamaRes = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) });
          if (ollamaRes.ok) {
            const tagsData = (await ollamaRes.json()) as { models?: Array<{ name: string }> };
            const installedModels = (tagsData.models ?? []).map((m: { name: string }) => m.name);
            send({ type: 'check', key: 'ollama', status: 'ok', label: 'Ollama is running', detail: `${installedModels.length} models installed` });
          } else {
            send({ type: 'check', key: 'ollama', status: 'warn', label: 'Ollama responded with an error', detail: 'Try: ollama serve' });
          }
        } catch {
          send({ type: 'check', key: 'ollama', status: 'warn', label: 'Ollama not running', detail: 'Install from ollama.ai · models will be skipped' });
        }
      } else {
        send({ type: 'check', key: 'cloud', status: 'ok', label: `Using ${orchestratorProvider ?? executorProvider} cloud AI`, detail: 'No local download needed' });
      }

      await delay(300);

      // System info
      const ramGb = Math.floor(os.totalmem() / 1024 / 1024 / 1024);
      send({ type: 'check', key: 'system', status: 'ok', label: `System ready`, detail: `${ramGb}GB RAM · ${os.cpus().length} cores · ${process.platform}` });
      await delay(200);

      // ── Stage 2: Model downloads ──
      send({ type: 'stage', stage: 'download' });

      if (executorProvider === 'ollama' && bundleId) {
        const models = BUNDLE_MODELS[bundleId] ?? [];

        // Get already-installed models
        let installed: string[] = [];
        try {
          const r = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
          if (r.ok) {
            const data = (await r.json()) as { models?: Array<{ name: string }> };
            installed = (data.models ?? []).map((m: { name: string }) => m.name);
          }
        } catch { /* skip */ }

        for (const model of models) {
          const alreadyHave = installed.some((n) => n.startsWith(model.tag.split(':')[0]));
          if (alreadyHave) {
            send({ type: 'model_progress', tag: model.tag, name: model.name, role: model.role, status: 'exists', progress: 1, completed: 0, total: 0 });
            await delay(150);
            continue;
          }

          send({ type: 'model_progress', tag: model.tag, name: model.name, role: model.role, status: 'pulling', progress: 0, completed: 0, total: 0 });

          try {
            const pullRes = await fetch('http://localhost:11434/api/pull', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ name: model.tag, stream: true }),
              signal: AbortSignal.timeout(30 * 60 * 1000), // 30min max
            });

            if (!pullRes.ok || !pullRes.body) {
              send({ type: 'model_progress', tag: model.tag, name: model.name, role: model.role, status: 'error', progress: 0, completed: 0, total: 0, error: 'Pull failed' });
              continue;
            }

            const reader = pullRes.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              for (const line of chunk.split('\n').filter(Boolean)) {
                try {
                  const evt = JSON.parse(line) as { status?: string; completed?: number; total?: number };
                  if (evt.total && evt.total > 0) {
                    const progress = Math.min((evt.completed ?? 0) / evt.total, 0.99);
                    send({ type: 'model_progress', tag: model.tag, name: model.name, role: model.role, status: 'pulling', progress, completed: evt.completed ?? 0, total: evt.total });
                  }
                } catch { /* skip malformed lines */ }
              }
            }

            send({ type: 'model_progress', tag: model.tag, name: model.name, role: model.role, status: 'done', progress: 1, completed: 0, total: 0 });
          } catch (err) {
            send({ type: 'model_progress', tag: model.tag, name: model.name, role: model.role, status: 'error', progress: 0, completed: 0, total: 0, error: String(err) });
          }
        }
      } else if (executorProvider !== 'ollama') {
        // Cloud executor: just simulate a brief connection test
        send({ type: 'cloud_ready', provider: orchestratorProvider ?? executorProvider });
        await delay(600);
      }

      // ── Stage 3: Project scan ──
      send({ type: 'stage', stage: 'scan' });
      await delay(300);

      if (projectPath && existsSync(projectPath)) {
        const scan = scanProject(projectPath);
        send({ type: 'scan_done', ...scan });
      } else {
        send({ type: 'scan_done', files: 0, testFiles: 0, primaryLanguage: 'Unknown', framework: 'unknown', topDirs: [], languageBreakdown: {}, entryPoints: [] });
      }

      await delay(200);
      send({ type: 'done' });
      reply.raw.end();
    },
  );

  // ─── Deep project scan ──────────────────────────────────────────────────────

  app.post<{ Body: { path: string } }>(
    '/api/setup/scan',
    { schema: { body: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } } } },
    async (req, reply) => {
      const { path } = req.body;
      if (!existsSync(path)) {
        return reply.status(400).send({ error: 'Path does not exist' });
      }
      return reply.send(scanProject(path));
    },
  );
}

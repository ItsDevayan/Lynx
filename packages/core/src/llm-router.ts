/**
 * Lynx — Two-Tier LLM Router
 *
 * ┌──────────────────────────────────────────────┐
 * │  ORCHESTRATOR  (reasons, plans, decides)      │
 * │  → Groq API  (Llama 3.3 70B, free)           │
 * │  → Claude API/CLI (best reasoning, optional)  │
 * │  → OpenAI (GPT-4o, optional)                  │
 * └─────────────────────┬────────────────────────┘
 *                       │  delegates tasks to
 * ┌─────────────────────▼────────────────────────┐
 * │  EXECUTOR  (writes code, edits files, works)  │
 * │  → Ollama local  (private, free, fast)        │
 * │  → Falls back to orchestrator if no Ollama    │
 * └──────────────────────────────────────────────┘
 *
 * Usage:
 *   orchestrate(msgs)  → reasoning, planning, deciding
 *   execute(msgs)      → code writing, editing, heavy lifting
 *   chat(msgs, opts)   → compat wrapper (routes by tier)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrchestratorProvider = 'groq' | 'claude-api' | 'claude-cli' | 'openai' | 'none';
export type ExecutorProvider     = 'ollama' | 'orchestrator';

/** Legacy tier type kept for backward compatibility */
export type LLMTier = 'heavy' | 'normal' | 'premium' | 'claude-cli';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  role: 'orchestrator' | 'executor';
  thinking?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface LLMRequestOptions {
  tier?: LLMTier;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface OrchestratorConfig {
  provider: OrchestratorProvider;
  /** Groq API key — free at console.groq.com */
  groqApiKey?: string;
  /** Groq model override (default: llama-3.3-70b-versatile) */
  groqModel?: string;
  /** Anthropic API key */
  anthropicApiKey?: string;
  /** Claude model (default: claude-sonnet-4-6) */
  claudeModel?: string;
  /** OpenAI API key */
  openaiApiKey?: string;
  /** OpenAI model (default: gpt-4o) */
  openaiModel?: string;
}

export interface ExecutorConfig {
  provider: ExecutorProvider;
  /** Ollama base URL (default: http://localhost:11434) */
  baseUrl?: string;
  /** Ollama model tag */
  model?: string;
}

export interface LLMConfig {
  orchestrator: OrchestratorConfig;
  executor: ExecutorConfig;
  /** Legacy fields kept for backward compat */
  groqApiKey?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
}

let cfg: LLMConfig = {
  orchestrator: { provider: 'none' },
  executor: {
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'mistral:7b-instruct-q4_K_M',
  },
};

export function configureLLM(input: Partial<LLMConfig>): void {
  // Handle legacy flat config (from .env / old setup)
  if (input.groqApiKey && !input.orchestrator) {
    input = {
      ...input,
      orchestrator: { provider: 'groq', groqApiKey: input.groqApiKey },
    };
  }
  if (input.anthropicApiKey && !input.orchestrator) {
    input = {
      ...input,
      orchestrator: { provider: 'claude-api', anthropicApiKey: input.anthropicApiKey },
    };
  }
  if ((input.ollamaBaseUrl || input.ollamaModel) && !input.executor) {
    input = {
      ...input,
      executor: {
        provider: 'ollama',
        baseUrl: input.ollamaBaseUrl ?? cfg.executor.baseUrl,
        model: input.ollamaModel ?? cfg.executor.model,
      },
    };
  }

  cfg = {
    orchestrator: { ...cfg.orchestrator, ...(input.orchestrator ?? {}) },
    executor: { ...cfg.executor, ...(input.executor ?? {}) },
    groqApiKey: input.groqApiKey ?? cfg.groqApiKey,
    ollamaBaseUrl: input.ollamaBaseUrl ?? cfg.ollamaBaseUrl,
    ollamaModel: input.ollamaModel ?? cfg.ollamaModel,
    anthropicApiKey: input.anthropicApiKey ?? cfg.anthropicApiKey,
    openaiApiKey: input.openaiApiKey ?? cfg.openaiApiKey,
  };
}

export function getLLMConfig(): LLMConfig { return cfg; }

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * ORCHESTRATE — reasoning, planning, deciding what to do.
 * Routes to: Groq (free) → Claude API → Claude CLI → OpenAI → Ollama fallback
 */
export async function orchestrate(
  messages: LLMMessage[],
  opts: LLMRequestOptions = {},
  overrideCfg?: Partial<LLMConfig>,
): Promise<LLMResponse> {
  const resolved = overrideCfg
    ? { ...cfg, orchestrator: { ...cfg.orchestrator, ...(overrideCfg.orchestrator ?? {}) }, executor: { ...cfg.executor, ...(overrideCfg.executor ?? {}) } }
    : cfg;
  const o = resolved.orchestrator;

  try {
    switch (o.provider) {
      case 'groq': {
        const key = o.groqApiKey ?? resolved.groqApiKey;
        if (!key) throw new Error('No Groq API key');
        return await groqChat(messages, opts, key, o.groqModel);
      }
      case 'claude-api': {
        const key = o.anthropicApiKey ?? resolved.anthropicApiKey;
        if (!key) throw new Error('No Anthropic API key');
        return await claudeApiChat(messages, opts, key, o.claudeModel);
      }
      case 'claude-cli':
        return await claudeCliChat(messages, opts);
      case 'openai': {
        const key = o.openaiApiKey ?? resolved.openaiApiKey;
        if (!key) throw new Error('No OpenAI API key');
        return await openaiChat(messages, opts, key, o.openaiModel);
      }
      default:
        // No orchestrator configured — fall through to executor
        return await execute(messages, opts);
    }
  } catch (err) {
    // Graceful fallback to executor
    console.warn(`[lynx:llm] orchestrator failed (${err}), falling back to executor`);
    return await execute(messages, opts);
  }
}

/**
 * EXECUTE — code writing, file editing, test generation, heavy lifting.
 * Routes to: Ollama (local) → orchestrator fallback
 */
export async function execute(
  messages: LLMMessage[],
  opts: LLMRequestOptions = {},
): Promise<LLMResponse> {
  const e = cfg.executor;

  try {
    if (e.provider === 'ollama') {
      return await ollamaChat(messages, opts, e.baseUrl, e.model);
    }
    // 'orchestrator' provider — use orchestrator for execution too (simple setup)
    return await orchestrate(messages, opts);
  } catch (err) {
    throw new Error(`Executor failed: ${err}. Install Ollama or configure an orchestrator.`);
  }
}

/**
 * CHAT — general-purpose, backward-compat wrapper.
 * Uses orchestrator for heavy/premium, executor for normal.
 */
export async function chat(
  messages: LLMMessage[],
  opts: LLMRequestOptions = {},
): Promise<LLMResponse> {
  const tier = opts.tier;
  if (tier === 'heavy' || tier === 'premium' || tier === 'claude-cli') {
    return orchestrate(messages, opts);
  }
  return execute(messages, opts);
}

// ─── Groq (Llama 3.3 70B — free orchestrator) ────────────────────────────────

async function groqChat(
  messages: LLMMessage[],
  opts: LLMRequestOptions,
  apiKey: string,
  modelOverride?: string,
): Promise<LLMResponse> {
  const model = modelOverride ?? 'llama-3.3-70b-versatile';
  const all = opts.systemPrompt
    ? [{ role: 'system' as const, content: opts.systemPrompt }, ...messages]
    : messages;

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: all,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.2,
    }),
  });

  if (!resp.ok) throw new Error(`Groq ${resp.status}: ${await resp.text()}`);

  const data = await resp.json() as {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    content: data.choices[0].message.content,
    model: data.model,
    role: 'orchestrator',
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
  };
}

// ─── Claude API ───────────────────────────────────────────────────────────────

async function claudeApiChat(
  messages: LLMMessage[],
  opts: LLMRequestOptions,
  apiKey: string,
  modelOverride?: string,
): Promise<LLMResponse> {
  const model = modelOverride ?? 'claude-sonnet-4-6';
  const sysMsg = opts.systemPrompt ?? messages.find((m) => m.role === 'system')?.content ?? '';
  const userMsgs = messages.filter((m) => m.role !== 'system');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 8096,
      system: sysMsg,
      messages: userMsgs,
      thinking: { type: 'enabled', budget_tokens: 3000 },
    }),
  });

  if (!resp.ok) throw new Error(`Claude API ${resp.status}: ${await resp.text()}`);

  const data = await resp.json() as {
    content: Array<{ type: string; text?: string; thinking?: string }>;
    model: string;
    usage: { input_tokens: number; output_tokens: number };
  };

  return {
    content: data.content.find((b) => b.type === 'text')?.text ?? '',
    model: data.model,
    role: 'orchestrator',
    thinking: data.content.find((b) => b.type === 'thinking')?.thinking,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
  };
}

// ─── Claude CLI ───────────────────────────────────────────────────────────────

async function claudeCliChat(
  messages: LLMMessage[],
  _opts: LLMRequestOptions,
): Promise<LLMResponse> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const exec = promisify(execFile);

  const prompt = messages
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const { stdout } = await exec('claude', ['--print', '--no-markdown', prompt], {
    timeout: 120_000,
  });

  return { content: stdout.trim(), model: 'claude-cli', role: 'orchestrator' };
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

async function openaiChat(
  messages: LLMMessage[],
  opts: LLMRequestOptions,
  apiKey: string,
  modelOverride?: string,
): Promise<LLMResponse> {
  const model = modelOverride ?? 'gpt-4o';
  const all = opts.systemPrompt
    ? [{ role: 'system' as const, content: opts.systemPrompt }, ...messages]
    : messages;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: all,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.2,
    }),
  });

  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${await resp.text()}`);

  const data = await resp.json() as {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    content: data.choices[0].message.content,
    model: data.model,
    role: 'orchestrator',
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
  };
}

// ─── Ollama (local executor) ──────────────────────────────────────────────────

async function ollamaChat(
  messages: LLMMessage[],
  opts: LLMRequestOptions,
  baseUrl?: string,
  modelOverride?: string,
): Promise<LLMResponse> {
  const url   = baseUrl ?? cfg.executor.baseUrl ?? 'http://localhost:11434';
  const model = modelOverride ?? cfg.executor.model ?? cfg.ollamaModel ?? 'mistral:7b-instruct-q4_K_M';

  const all = opts.systemPrompt
    ? [{ role: 'system', content: opts.systemPrompt }, ...messages]
    : messages;

  const resp = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: all,
      stream: false,
      options: { num_predict: opts.maxTokens ?? 4096, temperature: opts.temperature ?? 0.15 },
    }),
  });

  if (!resp.ok) throw new Error(`Ollama ${resp.status}: ${await resp.text()}`);

  const data = await resp.json() as { message: { content: string }; model: string };

  return { content: data.message.content, model: data.model, role: 'executor' };
}

// ─── Model Recommendation ─────────────────────────────────────────────────────

export interface ModelRecommendation {
  tag: string;
  name: string;
  reason: string;
  ramRequired: string;
  quality: string;
}

export async function recommendLocalModel(): Promise<ModelRecommendation> {
  const os = await import('os');
  const ram = Math.round(os.totalmem() / 1024 / 1024 / 1024);

  let gpuVram = 0;
  try {
    const { execSync } = await import('child_process');
    const out = execSync('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null', { timeout: 3000 }).toString();
    gpuVram = Math.floor(parseInt(out.trim().split('\n')[0]) / 1024);
  } catch { /* no GPU */ }

  if (gpuVram >= 24 || ram >= 64) return {
    tag: 'qwen2.5:32b-instruct-q4_K_M', name: 'Qwen 2.5 32B', quality: '★★★★★',
    reason: `${gpuVram ? `${gpuVram}GB VRAM` : `${ram}GB RAM`} — near-GPT-4 quality locally`,
    ramRequired: '20GB',
  };
  if (ram >= 16) return {
    tag: 'qwen2.5:14b-instruct-q4_K_M', name: 'Qwen 2.5 14B', quality: '★★★★☆',
    reason: `${ram}GB RAM — best code model for your specs`,
    ramRequired: '10GB',
  };
  if (ram >= 8) return {
    tag: 'qwen2.5:7b-instruct-q4_K_M', name: 'Qwen 2.5 7B', quality: '★★★☆☆',
    reason: `${ram}GB RAM — solid coding, fast responses`,
    ramRequired: '5GB',
  };
  return {
    tag: 'phi3.5:3.8b-mini-instruct-q4_K_M', name: 'Phi-3.5 Mini', quality: '★★☆☆☆',
    reason: `${ram}GB RAM — lightweight, best available`,
    ramRequired: '3GB',
  };
}

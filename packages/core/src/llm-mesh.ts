/**
 * Lynx LLM Mesh — Conductor + Specialist Routing
 *
 * How it works:
 *
 *  User input
 *      │
 *      ▼
 *  [1] Conductor (Groq/Claude/OpenAI)
 *      Classifies task, refines context, decides which specialist(s) to use
 *      │
 *      ├─ general task ──────────▶  [2a] General model (Llama 3.2 / Phi-3)
 *      │
 *      ├─ easy code ─────────────▶  [2b] Coder (Qwen 2.5 Coder)
 *      │                                   + Autocomplete (DeepSeek 1.3B) in parallel if RAM allows
 *      │
 *      └─ hard code / reasoning ─▶  [2c] Reasoner (DeepSeek R1) first
 *                                         then Coder to implement the plan
 *
 *  Context is always:
 *    - Refined/compressed before passing to specialists (fit their context window)
 *    - Stored in session memory (ring buffer + Qdrant for long-term)
 *    - Passed with role-appropriate system prompts
 *
 *  Models sleep (Ollama keep_alive: 0) when not used, wake on demand.
 *  Parallel execution if availableRam >= bundle.parallelRamGb.
 */

import type { ModelBundle, ModelRole } from './model-bundles.js';

// ─── Task Classification ──────────────────────────────────────────────────────

export type TaskType =
  | 'general'       // chat, writing, summarization
  | 'code-easy'     // simple functions, boilerplate, formatting
  | 'code-hard'     // architecture, debugging, complex refactors
  | 'reasoning'     // logic puzzles, math, multi-step problems
  | 'autocomplete'  // inline completion, sub-200ms expected
  | 'bottleneck';   // task exceeds model capabilities

export interface ClassifiedTask {
  type: TaskType;
  confidence: number;        // 0-1
  refinedPrompt: string;     // context-refined prompt for the specialist
  estimatedTokens: number;
  bottleneckReason?: string; // set if type === 'bottleneck'
}

export interface MeshMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  from?: string;  // which model produced this
  taskType?: TaskType;
  timestamp?: number;
}

export interface MeshResponse {
  content: string;
  taskType: TaskType;
  conductor: string;
  specialist: string;
  thinking?: string;
  isBottleneck: boolean;
  bottleneckReason?: string;
  executionMode: 'parallel' | 'serial';
  stepsLog: string[];
}

export interface MeshConfig {
  bundle: ModelBundle;
  availableRamGb: number;
  ollamaBaseUrl?: string;
  sessionId?: string;
  /** Max tokens to pass as context to specialists */
  contextBudget?: number;
}

// ─── Session Memory ───────────────────────────────────────────────────────────

const SESSION_MEMORY = new Map<string, MeshMessage[]>();
const MAX_SESSION_MSGS = 40;

export function addToSession(sessionId: string, msg: MeshMessage): void {
  const msgs = SESSION_MEMORY.get(sessionId) ?? [];
  msgs.push({ ...msg, timestamp: Date.now() });
  if (msgs.length > MAX_SESSION_MSGS) msgs.shift();
  SESSION_MEMORY.set(sessionId, msgs);
}

export function getSession(sessionId: string): MeshMessage[] {
  return SESSION_MEMORY.get(sessionId) ?? [];
}

export function clearSession(sessionId: string): void {
  SESSION_MEMORY.delete(sessionId);
}

/** Compress session history to fit context budget */
function compressHistory(msgs: MeshMessage[], maxTokens: number): MeshMessage[] {
  // Rough estimate: 1 token ≈ 4 chars
  let budget = maxTokens * 4;
  const recent: MeshMessage[] = [];

  // Always keep system messages
  const system = msgs.filter((m) => m.role === 'system');
  for (const m of system) budget -= m.content.length;

  // Fill from most recent
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'system') continue;
    if (budget <= 0) break;
    budget -= msgs[i].content.length;
    recent.unshift(msgs[i]);
  }

  return [...system, ...recent];
}

// ─── Context Refiner ──────────────────────────────────────────────────────────

/**
 * Refine/compress prompt for a specialist model.
 * Strips redundancy, adds role-appropriate framing.
 * This runs in the conductor before dispatching.
 */
function buildSpecialistPrompt(
  userPrompt: string,
  taskType: TaskType,
  history: MeshMessage[],
  contextBudget: number,
): string {
  const compressed = compressHistory(history, contextBudget);

  const contextBlock = compressed.length > 0
    ? `\n\n--- CONVERSATION CONTEXT ---\n${
        compressed
          .filter((m) => m.role !== 'system')
          .slice(-6)
          .map((m) => `${m.from ?? m.role.toUpperCase()}: ${m.content.slice(0, 400)}`)
          .join('\n')
      }\n--- END CONTEXT ---\n\n`
    : '';

  const frameMap: Record<TaskType, string> = {
    'general':      'Answer clearly and concisely.',
    'code-easy':    'Write clean, working code. No explanations unless asked.',
    'code-hard':    'Implement the solution fully. Consider edge cases. Add comments for non-obvious logic.',
    'reasoning':    'Think step by step. Show your reasoning.',
    'autocomplete': 'Complete the code. Output only the completion, no explanation.',
    'bottleneck':   '',
  };

  return `${contextBlock}${frameMap[taskType]}\n\n${userPrompt}`;
}

// ─── Task Classifier ──────────────────────────────────────────────────────────

/**
 * Heuristic task classifier (runs locally, no LLM needed for speed).
 * The conductor LLM does a deeper classification when available.
 */
function heuristicClassify(prompt: string): TaskType {
  const p = prompt.toLowerCase();

  // Autocomplete signals
  if (p.length < 80 && (p.endsWith('(') || p.endsWith('{') || p.endsWith('.'))) return 'autocomplete';

  // Code signals
  const codeKeywords = ['function', 'class', 'const ', 'let ', 'var ', 'def ', 'import ', 'export ',
    'async ', 'await ', 'return ', '=>', 'interface ', 'type ', 'struct ', 'fn ', 'mod '];
  const codeScore = codeKeywords.filter((k) => p.includes(k)).length;

  // Hard code signals
  const hardKeywords = ['refactor', 'architecture', 'performance', 'optimize', 'debug', 'fix bug',
    'memory leak', 'race condition', 'deadlock', 'algorithm', 'complexity'];
  const hardScore = hardKeywords.filter((k) => p.includes(k)).length;

  // Reasoning signals
  const reasonKeywords = ['why does', 'explain why', 'prove that', 'derive', 'logic', 'math',
    'calculate', 'step by step', 'chain of thought'];
  const reasonScore = reasonKeywords.filter((k) => p.includes(k)).length;

  if (reasonScore >= 2) return 'reasoning';
  if (hardScore >= 2 || (codeScore >= 3 && p.length > 200)) return 'code-hard';
  if (codeScore >= 1) return 'code-easy';
  return 'general';
}

// ─── Conductor Classification (via LLM) ──────────────────────────────────────

const CLASSIFY_SYSTEM = `You are a task router. Classify the user's request into exactly one category.
Reply with JSON only: { "type": "<type>", "confidence": 0.0-1.0, "bottleneckReason": "<string or null>" }

Categories:
- "general"       chat, writing, questions, summaries
- "code-easy"     simple code: short functions, boilerplate, syntax fixes
- "code-hard"     complex code: architecture, debugging, optimization, refactors >50 lines
- "reasoning"     math, logic, step-by-step analysis, proof-like problems
- "autocomplete"  complete a partial code snippet (very short input)
- "bottleneck"    the task is clearly beyond what local 7-14B models can handle

For "bottleneck", set bottleneckReason explaining what capability is missing.
Only flag bottleneck for truly extreme tasks (e.g. training a new model, billion-row SQL optimization without schema).`;

async function conductorClassify(
  prompt: string,
  conductorFn: (msgs: MeshMessage[]) => Promise<{ content: string }>,
): Promise<{ type: TaskType; confidence: number; bottleneckReason?: string }> {
  try {
    const resp = await conductorFn([
      { role: 'system', content: CLASSIFY_SYSTEM },
      { role: 'user', content: prompt.slice(0, 1500) }, // cap classification input
    ]);

    const raw = resp.content.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        type: parsed.type as TaskType,
        confidence: parsed.confidence ?? 0.8,
        bottleneckReason: parsed.bottleneckReason ?? undefined,
      };
    }
  } catch { /* fall through to heuristic */ }

  return { type: heuristicClassify(prompt), confidence: 0.6 };
}

// ─── Ollama Model Caller ──────────────────────────────────────────────────────

interface OllamaCallOptions {
  baseUrl: string;
  modelTag: string;
  messages: MeshMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  /** 0 = unload immediately after response (saves RAM) */
  keepAliveSeconds?: number;
}

async function callOllama(opts: OllamaCallOptions): Promise<string> {
  const {
    baseUrl, modelTag, messages, systemPrompt,
    maxTokens = 4096, temperature = 0.15,
    keepAliveSeconds = 300,
  } = opts;

  const allMsgs = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const resp = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelTag,
      messages: allMsgs.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      keep_alive: `${keepAliveSeconds}s`,
      options: { num_predict: maxTokens, temperature },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Ollama [${modelTag}]: ${resp.status} ${err}`);
  }

  const data = await resp.json() as { message: { content: string } };
  return data.message.content;
}

/** Unload a model from Ollama memory */
async function unloadModel(baseUrl: string, modelTag: string): Promise<void> {
  try {
    await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelTag, keep_alive: '0s', messages: [] }),
    });
  } catch { /* non-critical */ }
}

// ─── Main Mesh Router ─────────────────────────────────────────────────────────

export class LLMesh {
  private config: Required<MeshConfig>;
  private conductorFn?: (msgs: MeshMessage[]) => Promise<{ content: string; thinking?: string }>;

  constructor(
    config: MeshConfig,
    conductorFn?: (msgs: MeshMessage[]) => Promise<{ content: string; thinking?: string }>,
  ) {
    this.config = {
      bundle: config.bundle,
      availableRamGb: config.availableRamGb,
      ollamaBaseUrl: config.ollamaBaseUrl ?? 'http://localhost:11434',
      sessionId: config.sessionId ?? 'default',
      contextBudget: config.contextBudget ?? 2048,
    };
    this.conductorFn = conductorFn;
  }

  /** Primary entry point */
  async route(userPrompt: string): Promise<MeshResponse> {
    const steps: string[] = [];
    const baseUrl = this.config.ollamaBaseUrl;
    const bundle = this.config.bundle;
    const sessionId = this.config.sessionId;

    // 1. Classify task
    steps.push('[1] classifying task');
    const classification = this.conductorFn
      ? await conductorClassify(userPrompt, this.conductorFn)
      : { type: heuristicClassify(userPrompt), confidence: 0.6 };

    const taskType = classification.type;
    steps.push(`[1] → ${taskType} (confidence: ${(classification.confidence * 100).toFixed(0)}%)`);

    // 2. Handle bottleneck
    if (taskType === 'bottleneck') {
      return {
        content: `⚠️ Model bottleneck detected.\n\n${classification.bottleneckReason ?? 'This task exceeds what current local models can handle reliably.'}\n\nConsider: using a cloud orchestrator (Groq/Claude) directly, or breaking the task into smaller pieces.`,
        taskType: 'bottleneck',
        conductor: 'conductor',
        specialist: 'none',
        isBottleneck: true,
        bottleneckReason: classification.bottleneckReason,
        executionMode: 'serial',
        stepsLog: steps,
      };
    }

    // 3. Get session history
    const history = getSession(sessionId);

    // 4. Refine context for specialist
    steps.push('[2] refining context for specialist');
    const refinedPrompt = buildSpecialistPrompt(
      userPrompt,
      taskType,
      history,
      this.config.contextBudget,
    );

    // 5. Route to specialist(s)
    const parallel = this.config.availableRamGb >= bundle.parallelRamGb;
    let content = '';
    let specialistName = '';
    let conductorName = 'heuristic';
    let thinking: string | undefined;

    steps.push(`[3] execution mode: ${parallel ? 'parallel' : 'serial'}`);

    try {
      switch (taskType) {
        case 'general': {
          const model = bundle.models.general;
          if (!model) throw new Error('No general model in bundle');
          steps.push(`[3] routing to general: ${model.name}`);
          content = await callOllama({
            baseUrl, modelTag: model.tag, messages: [{ role: 'user', content: refinedPrompt }],
            keepAliveSeconds: 300,
          });
          specialistName = model.name;
          break;
        }

        case 'autocomplete': {
          const model = bundle.models.autocomplete ?? bundle.models.coder;
          if (!model) throw new Error('No autocomplete model in bundle');
          steps.push(`[3] routing to autocomplete: ${model.name}`);
          content = await callOllama({
            baseUrl, modelTag: model.tag,
            messages: [{ role: 'user', content: userPrompt }],
            maxTokens: 256, temperature: 0.05, keepAliveSeconds: 600,
          });
          specialistName = model.name;
          break;
        }

        case 'code-easy': {
          const coder = bundle.models.coder;
          const auto  = bundle.models.autocomplete;
          if (!coder) throw new Error('No coder model in bundle');

          steps.push(`[3] routing to coder: ${coder.name}`);

          if (parallel && auto) {
            // Run coder + autocomplete in parallel, merge
            steps.push(`[3] parallel: ${coder.name} + ${auto.name}`);
            const [codeResult, autoResult] = await Promise.allSettled([
              callOllama({ baseUrl, modelTag: coder.tag, messages: [{ role: 'user', content: refinedPrompt }], keepAliveSeconds: 300 }),
              callOllama({ baseUrl, modelTag: auto.tag,  messages: [{ role: 'user', content: userPrompt }], maxTokens: 150, temperature: 0.05, keepAliveSeconds: 600 }),
            ]);
            content = codeResult.status === 'fulfilled' ? codeResult.value : (autoResult.status === 'fulfilled' ? autoResult.value : '');
            specialistName = `${coder.name} + ${auto.name}`;
          } else {
            content = await callOllama({ baseUrl, modelTag: coder.tag, messages: [{ role: 'user', content: refinedPrompt }], keepAliveSeconds: 300 });
            specialistName = coder.name;
          }
          break;
        }

        case 'code-hard': {
          const reasoner = bundle.models.reasoner;
          const coder    = bundle.models.coder;

          steps.push(`[3] hard code: reasoner first, then coder`);

          // Step A: Reasoner plans
          let plan = '';
          if (reasoner) {
            steps.push(`[3a] reasoning with: ${reasoner.name}`);
            plan = await callOllama({
              baseUrl, modelTag: reasoner.tag,
              messages: [{ role: 'user', content: `Plan the implementation for this task. Be concise — output a numbered plan only, no code yet.\n\n${refinedPrompt}` }],
              maxTokens: 1024, temperature: 0.1,
              keepAliveSeconds: parallel ? 60 : 0, // unload if serial to free RAM
            });
            steps.push(`[3a] plan ready (${plan.length} chars)`);
          }

          // Step B: Coder implements
          if (coder) {
            steps.push(`[3b] implementing with: ${coder.name}`);
            const coderPrompt = plan
              ? `Implement the following plan:\n\n${plan}\n\n---\nOriginal request: ${userPrompt}`
              : refinedPrompt;
            content = await callOllama({
              baseUrl, modelTag: coder.tag,
              messages: [{ role: 'user', content: coderPrompt }],
              keepAliveSeconds: 300,
            });
            specialistName = reasoner ? `${reasoner.name} → ${coder.name}` : coder.name;
          } else {
            content = plan || 'No coder model available.';
            specialistName = reasoner?.name ?? 'none';
          }
          break;
        }

        case 'reasoning': {
          const reasoner = bundle.models.reasoner;
          if (!reasoner) {
            // Fall back to general
            const general = bundle.models.general;
            if (!general) throw new Error('No models in bundle');
            content = await callOllama({ baseUrl, modelTag: general.tag, messages: [{ role: 'user', content: refinedPrompt }] });
            specialistName = general.name + ' (reasoner unavailable)';
          } else {
            steps.push(`[3] reasoning with: ${reasoner.name}`);
            content = await callOllama({
              baseUrl, modelTag: reasoner.tag,
              messages: [{ role: 'user', content: refinedPrompt }],
              maxTokens: 4096, temperature: 0.05, keepAliveSeconds: 60,
            });
            specialistName = reasoner.name;
          }
          break;
        }
      }
    } catch (err) {
      const errMsg = String(err);
      steps.push(`[!] specialist failed: ${errMsg}`);

      // Final fallback: conductor
      if (this.conductorFn) {
        steps.push(`[!] falling back to conductor`);
        const fallback = await this.conductorFn([{ role: 'user', content: userPrompt }]);
        content = fallback.content;
        thinking = fallback.thinking;
        specialistName = 'conductor (fallback)';
        conductorName = 'conductor';
      } else {
        content = `Error: ${errMsg}\n\nAll models unavailable. Check that Ollama is running: ollama serve`;
      }
    }

    // 6. Store in session memory
    addToSession(sessionId, { role: 'user', content: userPrompt });
    addToSession(sessionId, { role: 'assistant', content, from: specialistName, taskType });

    steps.push(`[4] done → ${content.length} chars`);

    return {
      content,
      taskType,
      conductor: conductorName,
      specialist: specialistName,
      thinking,
      isBottleneck: false,
      executionMode: parallel ? 'parallel' : 'serial',
      stepsLog: steps,
    };
  }

  /** Unload all bundle models from Ollama (free RAM) */
  async unloadAll(): Promise<void> {
    const base = this.config.ollamaBaseUrl;
    const tags  = Object.values(this.config.bundle.models)
      .filter((m): m is NonNullable<typeof m> => !!m && !m.tag.startsWith('GROQ:'))
      .map((m) => m.tag);

    await Promise.allSettled(tags.map((tag) => unloadModel(base, tag)));
  }
}

// ─── Singleton factory ────────────────────────────────────────────────────────

let _mesh: LLMesh | null = null;

export function getMesh(): LLMesh | null { return _mesh; }

export function initMesh(
  config: MeshConfig,
  conductorFn?: (msgs: MeshMessage[]) => Promise<{ content: string; thinking?: string }>,
): LLMesh {
  _mesh = new LLMesh(config, conductorFn);
  return _mesh;
}

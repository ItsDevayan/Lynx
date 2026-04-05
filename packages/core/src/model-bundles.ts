/**
 * Lynx Model Bundles
 *
 * Defines model mesh configurations for different system specs and use-cases.
 * Each bundle specifies which Ollama models to use for each specialist role.
 *
 * ROLES IN THE MESH:
 *   conductor    → top-level orchestrator (cloud: Groq/Claude/OpenAI)
 *   general      → everyday chat, summaries, Q&A (small, fast local)
 *   coder        → code generation, completion, refactoring
 *   autocomplete → sub-second inline completions (ultra-lightweight)
 *   reasoner     → debugging, logic, complex problem-solving (slow but deep)
 *   creative     → writing, poetry, music theory, art prompts (expressive models)
 *   multimodal   → image + text understanding (art reference, diagram analysis)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModelRole =
  | 'general'
  | 'coder'
  | 'autocomplete'
  | 'reasoner'
  | 'creative'
  | 'multimodal';

export interface ModelSpec {
  tag: string;           // Ollama pull tag  e.g. "qwen2.5-coder:3b-q4_K_M"
  name: string;          // Human name
  ramRequired: number;   // GB of RAM needed (CPU only)
  vramRequired?: number; // GB of VRAM needed (GPU mode, partial offload OK)
  role: ModelRole;
  quality: string;       // ★★★☆☆
  speed: string;         // 'fast' | 'medium' | 'slow'
  context: number;       // context window tokens
  notes?: string;
}

export type UseCaseProfile =
  | 'coding-heavy'   // mostly writing and debugging code
  | 'general-use'    // chat, writing, tasks — no coding
  | 'balanced'       // mix of both
  | 'research'       // long docs, analysis, reasoning
  | 'creative'       // writing, music, art, creative projects
  | 'minimal';       // as lightweight as possible

export interface ModelBundle {
  id: string;
  name: string;
  description: string;
  tier: 'cpu' | 'gpu-consumer' | 'gpu-workstation' | 'gpu-datacenter';
  /** Minimum RAM to run ALL models serially */
  minRamGb: number;
  /** RAM needed to run 2 models in parallel */
  parallelRamGb: number;
  /** VRAM needed (optional — enables GPU-accelerated larger models) */
  minVramGb?: number;
  models: Partial<Record<ModelRole, ModelSpec>>;
  conductorHints: string;
  suitableFor: UseCaseProfile[];
}

// ─── Model Catalog ────────────────────────────────────────────────────────────

export const MODELS: Record<string, ModelSpec> = {

  // ══════════════════════════════════════════════════════════════════════════
  // GENERAL CHAT
  // ══════════════════════════════════════════════════════════════════════════

  'phi3.5-mini': {
    tag: 'phi3.5:3.8b-mini-instruct-q4_K_M',
    name: 'Phi-3.5 Mini 3.8B',
    ramRequired: 2.5, role: 'general', quality: '★★★☆☆', speed: 'fast', context: 4096,
    notes: 'Efficiency champion. 90% of daily tasks at ~2.3GB RAM.',
  },
  'llama3.2-3b': {
    tag: 'llama3.2:3b-instruct-q4_K_M',
    name: 'Llama 3.2 3B',
    ramRequired: 2.5, role: 'general', quality: '★★★☆☆', speed: 'fast', context: 8192,
    notes: 'Best general chat for 8GB systems. Multilingual, fast.',
  },
  'llama3.1-8b': {
    tag: 'llama3.1:8b-instruct-q4_K_M',
    name: 'Llama 3.1 8B',
    ramRequired: 5.5, role: 'general', quality: '★★★★☆', speed: 'medium', context: 32768,
    notes: 'Strong general model. Good for 16GB systems.',
  },
  'mistral-7b': {
    tag: 'mistral:7b-instruct-q4_K_M',
    name: 'Mistral 7B',
    ramRequired: 4.5, role: 'general', quality: '★★★☆☆', speed: 'medium', context: 8192,
    notes: 'Reliable all-rounder. Works well on 8–16GB.',
  },
  'llama3.3-70b': {
    tag: 'llama3.3:70b-instruct-q4_K_M',
    name: 'Llama 3.3 70B',
    ramRequired: 40, vramRequired: 16, role: 'general', quality: '★★★★★', speed: 'slow', context: 128000,
    notes: 'Flagship local general model. Needs 40GB RAM or 16GB VRAM + 24GB RAM (layered).',
  },
  'qwen2.5-72b': {
    tag: 'qwen2.5:72b-instruct-q4_K_M',
    name: 'Qwen 2.5 72B',
    ramRequired: 45, vramRequired: 24, role: 'general', quality: '★★★★★', speed: 'slow', context: 128000,
    notes: 'Top local general+code model. Near-GPT-4o quality. Needs 24GB VRAM or 45GB RAM.',
  },
  'mixtral-8x22b': {
    tag: 'mixtral:8x22b-instruct-v0.1-q4_K_M',
    name: 'Mixtral 8×22B MoE',
    ramRequired: 90, vramRequired: 48, role: 'general', quality: '★★★★★', speed: 'medium', context: 65536,
    notes: 'MoE — activates only 39B params per token. Fast for its quality. 48GB VRAM or 90GB RAM.',
  },
  'llama3.1-405b': {
    tag: 'llama3.1:405b-instruct-q4_K_M',
    name: 'Llama 3.1 405B',
    ramRequired: 230, vramRequired: 80, role: 'general', quality: '★★★★★', speed: 'slow', context: 128000,
    notes: "Meta's flagship. Multiple A100/H100 GPUs or extreme RAM. Datacenter tier.",
  },
  'llama3.1-70b-via-groq': {
    tag: 'GROQ:llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B (Groq)',
    ramRequired: 0, role: 'general', quality: '★★★★★', speed: 'fast', context: 128000,
    notes: 'Cloud via Groq free tier. Best quality for general tasks. Zero local RAM.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CODING
  // ══════════════════════════════════════════════════════════════════════════

  'qwen2.5-coder-3b': {
    tag: 'qwen2.5-coder:3b-instruct-q4_K_M',
    name: 'Qwen 2.5 Coder 3B',
    ramRequired: 2.5, role: 'coder', quality: '★★★★☆', speed: 'fast', context: 32768,
    notes: 'Top coding benchmark for 8GB. Fast, excellent at functions.',
  },
  'qwen2.5-coder-7b': {
    tag: 'qwen2.5-coder:7b-instruct-q4_K_M',
    name: 'Qwen 2.5 Coder 7B',
    ramRequired: 4.5, role: 'coder', quality: '★★★★★', speed: 'medium', context: 32768,
    notes: 'Best 7B coding model. Superior debugging. Needs ~5GB free.',
  },
  'qwen2.5-coder-14b': {
    tag: 'qwen2.5-coder:14b-instruct-q4_K_M',
    name: 'Qwen 2.5 Coder 14B',
    ramRequired: 9, role: 'coder', quality: '★★★★★', speed: 'medium', context: 32768,
    notes: 'Near-GPT-4 coding quality. Best for 16GB+ systems.',
  },
  'qwen2.5-coder-32b': {
    tag: 'qwen2.5-coder:32b-instruct-q4_K_M',
    name: 'Qwen 2.5 Coder 32B',
    ramRequired: 20, vramRequired: 12, role: 'coder', quality: '★★★★★', speed: 'slow', context: 32768,
    notes: 'Flagship coding model. 24GB+ RAM or 12GB VRAM + 12GB RAM split.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // AUTOCOMPLETE (ultra-fast inline)
  // ══════════════════════════════════════════════════════════════════════════

  'deepseek-coder-1.3b': {
    tag: 'deepseek-coder:1.3b-instruct-q4_K_M',
    name: 'DeepSeek Coder 1.3B',
    ramRequired: 1.2, role: 'autocomplete', quality: '★★★☆☆', speed: 'fast', context: 4096,
    notes: 'Ultra-lightweight. Background autocomplete while other models run.',
  },
  'qwen2.5-coder-1.5b': {
    tag: 'qwen2.5-coder:1.5b-instruct-q4_K_M',
    name: 'Qwen 2.5 Coder 1.5B',
    ramRequired: 1.5, role: 'autocomplete', quality: '★★★★☆', speed: 'fast', context: 8192,
    notes: 'Better than DeepSeek 1.3B for autocomplete, slightly more RAM.',
  },
  'gemma2-2b': {
    tag: 'gemma2:2b-instruct-q4_K_M',
    name: 'Gemma 2 2B',
    ramRequired: 1.8, role: 'autocomplete', quality: '★★★☆☆', speed: 'fast', context: 8192,
    notes: 'Maximum speed for heavily loaded systems.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // REASONER (chain-of-thought, debugging, logic)
  // ══════════════════════════════════════════════════════════════════════════

  'deepseek-r1-1.5b': {
    tag: 'deepseek-r1:1.5b-q4_K_M',
    name: 'DeepSeek R1 1.5B',
    ramRequired: 1.5, role: 'reasoner', quality: '★★☆☆☆', speed: 'medium', context: 8192,
    notes: 'Minimal reasoning. For very constrained systems only.',
  },
  'deepseek-r1-7b': {
    tag: 'deepseek-r1:7b-q4_K_M',
    name: 'DeepSeek R1 7B',
    ramRequired: 4.5, role: 'reasoner', quality: '★★★★☆', speed: 'slow', context: 8192,
    notes: 'Chain-of-thought reasoning. Good for 16GB. Uses ~5GB.',
  },
  'deepseek-r1-8b': {
    tag: 'deepseek-r1:8b-q4_K_M',
    name: 'DeepSeek R1 8B',
    ramRequired: 5.0, role: 'reasoner', quality: '★★★★☆', speed: 'slow', context: 8192,
    notes: 'Best reasoning for 8GB systems. Close other apps.',
  },
  'deepseek-r1-14b': {
    tag: 'deepseek-r1:14b-q4_K_M',
    name: 'DeepSeek R1 14B',
    ramRequired: 9, role: 'reasoner', quality: '★★★★★', speed: 'slow', context: 16384,
    notes: 'Excellent reasoning. Ideal for 16GB+. Complex debugging.',
  },
  'deepseek-r1-32b': {
    tag: 'deepseek-r1:32b-q4_K_M',
    name: 'DeepSeek R1 32B',
    ramRequired: 20, vramRequired: 12, role: 'reasoner', quality: '★★★★★', speed: 'slow', context: 32768,
    notes: 'Near-o1 reasoning at 32B. GPU-accelerated or 20GB+ RAM.',
  },
  'deepseek-r1-70b': {
    tag: 'deepseek-r1:70b-q4_K_M',
    name: 'DeepSeek R1 70B',
    ramRequired: 42, vramRequired: 16, role: 'reasoner', quality: '★★★★★', speed: 'slow', context: 65536,
    notes: 'Best open-source reasoning. Matches o1. 16GB VRAM + 26GB RAM or 42GB RAM.',
  },
  'qwq-32b': {
    tag: 'qwq:32b-q4_K_M',
    name: 'QwQ 32B',
    ramRequired: 20, role: 'reasoner', quality: '★★★★★', speed: 'slow', context: 32768,
    notes: 'Near-o1 reasoning quality. 24GB+ RAM required.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CREATIVE (writing, music theory, poetry, art prompts)
  // ══════════════════════════════════════════════════════════════════════════

  'gemma3-12b': {
    tag: 'gemma3:12b-it-q4_K_M',
    name: 'Gemma 3 12B',
    ramRequired: 8, role: 'creative', quality: '★★★★☆', speed: 'medium', context: 32768,
    notes: 'Google\'s creative powerhouse. Excellent for poetry, stories, song lyrics. Strong emotional intelligence.',
  },
  'mistral-nemo-12b': {
    tag: 'mistral-nemo:12b-instruct-2407-q4_K_M',
    name: 'Mistral Nemo 12B',
    ramRequired: 8, role: 'creative', quality: '★★★★☆', speed: 'medium', context: 128000,
    notes: '128K context window. Great for long-form writing, full novel chapters, or deep creative sessions.',
  },
  'phi4-14b': {
    tag: 'phi4:14b-q4_K_M',
    name: 'Microsoft Phi-4 14B',
    ramRequired: 9, role: 'creative', quality: '★★★★☆', speed: 'medium', context: 16384,
    notes: 'Microsoft\'s Phi-4. Exceptional creative reasoning — great for music theory, chord analysis, worldbuilding.',
  },
  'llama3.1-8b-creative': {
    tag: 'llama3.1:8b-instruct-q4_K_M',
    name: 'Llama 3.1 8B (creative)',
    ramRequired: 5.5, role: 'creative', quality: '★★★★☆', speed: 'medium', context: 32768,
    notes: 'Llama tuned with creative prompting. Great balance of speed and expressive output.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MULTIMODAL (image + text — art reference, diagram analysis, UI screenshots)
  // ══════════════════════════════════════════════════════════════════════════

  'llava-7b': {
    tag: 'llava:7b-v1.6-q4_K_M',
    name: 'LLaVA 7B v1.6',
    ramRequired: 5, role: 'multimodal', quality: '★★★☆☆', speed: 'medium', context: 4096,
    notes: 'See and describe images. Drop in art references, UI mockups, diagrams. Ask "what colors are in this painting?"',
  },
  'llava-13b': {
    tag: 'llava:13b-v1.6-q4_K_M',
    name: 'LLaVA 13B v1.6',
    ramRequired: 9, role: 'multimodal', quality: '★★★★☆', speed: 'slow', context: 4096,
    notes: 'Better image understanding. Analyze complex artwork, architectural drawings, code screenshots.',
  },
  'llava-34b': {
    tag: 'llava:34b-v1.6-q4_K_M',
    name: 'LLaVA 34B v1.6',
    ramRequired: 22, vramRequired: 16, role: 'multimodal', quality: '★★★★★', speed: 'slow', context: 4096,
    notes: 'Best image analysis locally. 16GB VRAM or 22GB RAM.',
  },
  'minicpm-v-8b': {
    tag: 'minicpm-v:8b-2.6-q4_K_M',
    name: 'MiniCPM-V 8B',
    ramRequired: 5.5, role: 'multimodal', quality: '★★★★☆', speed: 'medium', context: 32768,
    notes: 'Best small multimodal. Handles multiple images per prompt. Great for comparing art references.',
  },
};

// ─── Bundle Definitions ───────────────────────────────────────────────────────

export const BUNDLES: ModelBundle[] = [

  // ── CPU TIER ──────────────────────────────────────────────────────────────

  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Fits in 8GB RAM. Serial only. Close other apps.',
    tier: 'cpu',
    minRamGb: 6,
    parallelRamGb: 999,
    models: {
      general:      MODELS['phi3.5-mini'],
      coder:        MODELS['qwen2.5-coder-3b'],
      autocomplete: MODELS['deepseek-coder-1.3b'],
      reasoner:     MODELS['deepseek-r1-8b'],
    },
    conductorHints: 'Use Groq free tier or Claude CLI. Local models handle execution.',
    suitableFor: ['minimal', 'coding-heavy', 'balanced'],
  },

  {
    id: 'standard',
    name: 'Standard',
    description: '16GB RAM. Best balance of quality and speed. Parallel capable.',
    tier: 'cpu',
    minRamGb: 14,
    parallelRamGb: 16,
    models: {
      general:      MODELS['llama3.1-8b'],
      coder:        MODELS['qwen2.5-coder-7b'],
      autocomplete: MODELS['qwen2.5-coder-1.5b'],
      reasoner:     MODELS['deepseek-r1-14b'],
    },
    conductorHints: 'Can run general + autocomplete simultaneously. Reasoner serial.',
    suitableFor: ['coding-heavy', 'balanced', 'research'],
  },

  {
    id: 'workstation',
    name: 'Workstation',
    description: '24GB RAM, no GPU. All local, all capable. No sacrifices.',
    tier: 'cpu',
    minRamGb: 20,
    parallelRamGb: 24,
    models: {
      general:      MODELS['llama3.1-8b'],
      coder:        MODELS['qwen2.5-coder-14b'],
      autocomplete: MODELS['qwen2.5-coder-1.5b'],
      reasoner:     MODELS['deepseek-r1-14b'],
    },
    conductorHints: 'Can run coder + autocomplete in parallel. Reasoner + general simultaneously.',
    suitableFor: ['coding-heavy', 'balanced', 'research'],
  },

  {
    id: 'power-cpu',
    name: 'Power (CPU)',
    description: '32GB+ RAM, no GPU. Near-GPT-4 local without a graphics card.',
    tier: 'cpu',
    minRamGb: 28,
    parallelRamGb: 32,
    models: {
      general:      MODELS['llama3.1-8b'],
      coder:        MODELS['qwen2.5-coder-32b'],
      autocomplete: MODELS['qwen2.5-coder-1.5b'],
      reasoner:     MODELS['qwq-32b'],
    },
    conductorHints: 'Full parallel capability. Most models can run simultaneously.',
    suitableFor: ['coding-heavy', 'research', 'balanced'],
  },

  {
    id: 'general-only',
    name: 'General Use',
    description: 'No coding models. Just fast, capable chat and writing assistants.',
    tier: 'cpu',
    minRamGb: 4,
    parallelRamGb: 8,
    models: {
      general:  MODELS['llama3.2-3b'],
      reasoner: MODELS['deepseek-r1-7b'],
    },
    conductorHints: 'Light footprint. Good for writing, chat, analysis without coding.',
    suitableFor: ['general-use'],
  },

  {
    id: 'creative-studio',
    name: 'Creative Studio',
    description: '16GB RAM. Writing, music, art. Multimodal vision model included.',
    tier: 'cpu',
    minRamGb: 12,
    parallelRamGb: 16,
    models: {
      general:    MODELS['llama3.1-8b'],
      creative:   MODELS['gemma3-12b'],
      reasoner:   MODELS['deepseek-r1-7b'],
      multimodal: MODELS['llava-7b'],
    },
    conductorHints: 'Gemma 3 for expressive writing. LLaVA for image understanding. Reasoner for analysis.',
    suitableFor: ['creative'],
  },

  {
    id: 'creative-studio-lite',
    name: 'Creative Lite',
    description: '8GB RAM. Lean creative setup. Strong enough for most creative work.',
    tier: 'cpu',
    minRamGb: 6,
    parallelRamGb: 999,
    models: {
      general:  MODELS['llama3.2-3b'],
      creative: MODELS['llama3.1-8b-creative'],
      reasoner: MODELS['deepseek-r1-7b'],
    },
    conductorHints: 'Serial only. Llama for creative tasks, DeepSeek R1 for analysis.',
    suitableFor: ['creative', 'general-use'],
  },

  // ── CONSUMER GPU TIER ─────────────────────────────────────────────────────
  // RTX 3090 (24GB), RTX 4080/4090 (16-24GB), RTX 4070 Ti Super (16GB)
  // Rule: VRAM offloads layers — effective RAM = system + vram * 0.8

  {
    id: 'gpu-consumer',
    name: 'GPU — Consumer',
    description: 'RTX 4070 Ti Super / 4080 / 4090 (16–24GB VRAM) + 32GB RAM. 70B class with GPU acceleration.',
    tier: 'gpu-consumer',
    minRamGb: 24,
    minVramGb: 12,
    parallelRamGb: 32,
    models: {
      general:      MODELS['llama3.3-70b'],
      coder:        MODELS['qwen2.5-coder-32b'],
      autocomplete: MODELS['qwen2.5-coder-1.5b'],
      reasoner:     MODELS['deepseek-r1-32b'],
    },
    conductorHints: 'GPU handles the 70B and 32B models via layer offloading. Full parallel if 32GB+ RAM.',
    suitableFor: ['coding-heavy', 'balanced', 'research'],
  },

  {
    id: 'gpu-consumer-creative',
    name: 'GPU — Creative',
    description: 'RTX 4070 Ti Super / 4080 / 4090 (16–24GB VRAM). Full creative + multimodal suite.',
    tier: 'gpu-consumer',
    minRamGb: 20,
    minVramGb: 12,
    parallelRamGb: 28,
    models: {
      general:    MODELS['llama3.3-70b'],
      creative:   MODELS['phi4-14b'],
      reasoner:   MODELS['deepseek-r1-14b'],
      multimodal: MODELS['llava-34b'],
    },
    conductorHints: 'LLaVA 34B for serious image analysis. Phi-4 for creative depth. R1 for analysis.',
    suitableFor: ['creative', 'research'],
  },

  // ── WORKSTATION GPU TIER ──────────────────────────────────────────────────
  // RTX 6000 Ada (48GB), A40 (48GB), A6000 (48GB), A100 (40GB or 80GB)

  {
    id: 'gpu-workstation',
    name: 'GPU — Workstation',
    description: 'RTX 6000 Ada / A40 / A6000 (48GB VRAM) + 64GB RAM. 70B fully in VRAM, no offloading.',
    tier: 'gpu-workstation',
    minRamGb: 48,
    minVramGb: 24,
    parallelRamGb: 64,
    models: {
      general:      MODELS['qwen2.5-72b'],
      coder:        MODELS['qwen2.5-coder-32b'],
      autocomplete: MODELS['qwen2.5-coder-1.5b'],
      reasoner:     MODELS['deepseek-r1-70b'],
    },
    conductorHints: 'Qwen 2.5 72B fully in 48GB VRAM. All models parallel. Best open-source quality.',
    suitableFor: ['coding-heavy', 'balanced', 'research'],
  },

  {
    id: 'gpu-workstation-creative',
    name: 'GPU — Workstation Creative',
    description: 'RTX 6000 Ada / A40 (48GB VRAM). Full Qwen 72B + Phi-4 + LLaVA 34B in VRAM.',
    tier: 'gpu-workstation',
    minRamGb: 32,
    minVramGb: 24,
    parallelRamGb: 48,
    models: {
      general:    MODELS['qwen2.5-72b'],
      creative:   MODELS['mistral-nemo-12b'],
      reasoner:   MODELS['deepseek-r1-32b'],
      multimodal: MODELS['llava-34b'],
    },
    conductorHints: 'Mistral Nemo for 128K context creative sessions. LLaVA 34B for art analysis.',
    suitableFor: ['creative', 'research', 'balanced'],
  },

  // ── DATACENTER TIER ───────────────────────────────────────────────────────
  // NVIDIA H100 (80GB), H200 (141GB), A100 80GB, multi-GPU setups
  // 128GB+ VRAM total, 256GB–1TB system RAM

  {
    id: 'gpu-datacenter',
    name: 'GPU — Datacenter',
    description: 'H100 / H200 / A100 80GB+. 128GB+ VRAM. 405B class, multi-model parallel.',
    tier: 'gpu-datacenter',
    minRamGb: 128,
    minVramGb: 80,
    parallelRamGb: 256,
    models: {
      general:      MODELS['llama3.1-405b'],
      coder:        MODELS['qwen2.5-coder-32b'],
      autocomplete: MODELS['qwen2.5-coder-1.5b'],
      reasoner:     MODELS['deepseek-r1-70b'],
    },
    conductorHints: 'Llama 3.1 405B as the general model. Full precision possible. All models parallel.',
    suitableFor: ['coding-heavy', 'research', 'balanced'],
  },

  {
    id: 'gpu-datacenter-extreme',
    name: 'GPU — Extreme',
    description: 'Multi-H100 / DGX node. 1TB RAM. Run everything simultaneously at full precision.',
    tier: 'gpu-datacenter',
    minRamGb: 512,
    minVramGb: 160,
    parallelRamGb: 512,
    models: {
      general:    MODELS['llama3.1-405b'],
      coder:      MODELS['qwen2.5-coder-32b'],
      reasoner:   MODELS['deepseek-r1-70b'],
      creative:   MODELS['gemma3-12b'],
      multimodal: MODELS['llava-34b'],
    },
    conductorHints: 'No compromises. All models simultaneously. Full precision across the board.',
    suitableFor: ['coding-heavy', 'research', 'balanced', 'creative'],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Select the best bundle for given system specs */
export function recommendBundle(
  ramGb: number,
  vramGb: number = 0,
  profile: UseCaseProfile = 'balanced',
): ModelBundle {
  const effectiveRam = ramGb + vramGb * 0.8;

  const viable = BUNDLES
    .filter((b) =>
      effectiveRam >= b.minRamGb &&
      (!b.minVramGb || vramGb >= b.minVramGb) &&
      b.suitableFor.includes(profile),
    )
    .sort((a, b) => b.minRamGb - a.minRamGb);

  return viable[0] ?? BUNDLES[0];
}

/** Given a bundle and available RAM, determine if parallel execution is possible */
export function canRunParallel(bundle: ModelBundle, availableRamGb: number): boolean {
  return availableRamGb >= bundle.parallelRamGb;
}

/** Get all Ollama pull tags needed for a bundle */
export function getBundleTags(bundle: ModelBundle): string[] {
  return Object.values(bundle.models)
    .filter((m): m is ModelSpec => !!m && !m.tag.startsWith('GROQ:'))
    .map((m) => m.tag);
}

/** Estimate maximum RAM needed for a bundle (largest single model) */
export function bundleMaxRam(bundle: ModelBundle): number {
  return Math.max(
    0,
    ...Object.values(bundle.models)
      .filter((m): m is ModelSpec => !!m)
      .map((m) => m.ramRequired),
  );
}

/** Estimate total RAM to run all bundle models simultaneously */
export function bundleTotalRam(bundle: ModelBundle): number {
  return Object.values(bundle.models)
    .filter((m): m is ModelSpec => !!m)
    .reduce((sum, m) => sum + m.ramRequired, 0);
}

/** Get tier label */
export function tierLabel(tier: ModelBundle['tier']): string {
  switch (tier) {
    case 'cpu':              return 'CPU';
    case 'gpu-consumer':     return 'Consumer GPU';
    case 'gpu-workstation':  return 'Workstation GPU';
    case 'gpu-datacenter':   return 'Datacenter GPU';
  }
}

/** Get bundles by tier */
export function getBundlesByTier(tier: ModelBundle['tier']): ModelBundle[] {
  return BUNDLES.filter(b => b.tier === tier);
}

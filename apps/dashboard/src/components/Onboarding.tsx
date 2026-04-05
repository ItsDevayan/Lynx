/**
 * Lynx Onboarding — 4-step setup wizard
 *
 * Step 0: Use-case questionnaire (coding-heavy / general / research / minimal)
 * Step 1: Connect project (folder picker + file picker + manual path)
 * Step 2: AI architecture — orchestrator (brain) + bundle picker
 * Step 3: Alert channel
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrchestratorProvider = 'groq' | 'claude-api' | 'claude-cli' | 'openai' | 'none';
type ExecutorProvider     = 'ollama' | 'orchestrator';
type UseCaseProfile = 'coding-heavy' | 'general-use' | 'balanced' | 'research' | 'creative' | 'minimal';

interface ModelRec {
  tag: string; name: string; reason: string; ramRequired: string;
}

interface SystemInfo {
  ram: number; gpuVram?: number; cpus: number;
  recommendations: ModelRec[];
}

// Bundle types (mirrors packages/core/src/model-bundles.ts)
interface BundleModel {
  tag: string; name: string; ramRequired: number; role: string; speed: string; notes?: string;
}
interface BundleInfo {
  id: string;
  name: string;
  description: string;
  tier: 'cpu' | 'gpu-consumer' | 'gpu-workstation' | 'gpu-datacenter';
  minRamGb: number;
  parallelRamGb: number;
  minVramGb?: number;
  suitableFor: string[];
  models: Record<string, BundleModel>;
}

export interface LynxConfig {
  useCase: UseCaseProfile;
  projectPath: string;
  projectType?: string;
  orchestrator: { provider: OrchestratorProvider; apiKey?: string; model?: string };
  executor: { provider: ExecutorProvider; model?: string; baseUrl?: string; bundleId?: string };
  notify: { channel: string; url?: string };
}

interface OnboardingProps {
  onComplete: (cfg: LynxConfig) => void;
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

const STEP_LABELS = ['Profile', 'Project', 'AI Setup', 'Alerts'];

function Steps({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEP_LABELS.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300"
              style={{
                background:  i < current  ? 'var(--teal)'    : i === current ? 'var(--purple)' : 'var(--surface2)',
                color:       i <= current ? 'white'          : 'var(--text-mute)',
                border:      `1px solid ${i === current ? 'var(--purple-hi)' : i < current ? 'var(--teal)' : 'var(--border-lit)'}`,
                fontSize:    10,
              }}
            >
              {i < current ? '✓' : i + 1}
            </div>
            <span className="text-xs" style={{ color: i === current ? 'var(--text)' : i < current ? 'var(--teal)' : 'var(--text-mute)' }}>
              {label}
            </span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div className="w-8 h-px mx-2" style={{ background: i < current ? 'var(--teal)' : 'var(--border)' }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Back button ──────────────────────────────────────────────────────────────

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-mono flex items-center gap-1 mb-5 transition-colors"
      style={{ color: 'var(--text-mute)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-mute)')}
    >
      ← back
    </button>
  );
}

// ─── Step 0: Use-case questionnaire ──────────────────────────────────────────

const USE_CASES: Array<{
  id: UseCaseProfile;
  label: string;
  desc: string;
  icon: string;
  details: string;
}> = [
  {
    id: 'coding-heavy',
    label: 'Mostly coding',
    icon: '▸',
    desc: 'Writing code, debugging, refactoring',
    details: 'Qwen 2.5 Coder + DeepSeek R1 reasoner + autocomplete. The full engineer stack.',
  },
  {
    id: 'general-use',
    label: 'Writing & chat',
    icon: '◈',
    desc: 'Docs, Q&A, analysis — minimal code',
    details: 'Lightweight Llama + reasoning model. Fast, low RAM, no coding models loaded.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    icon: '◎',
    desc: 'Mix of coding and general tasks',
    details: 'Solid coder + general model. Works for most engineers day-to-day.',
  },
  {
    id: 'research',
    label: 'Research & analysis',
    icon: '◉',
    desc: 'Long documents, complex reasoning, deep dives',
    details: 'Strong reasoner with a large context window. DeepSeek R1 + Llama 3.1.',
  },
  {
    id: 'creative',
    label: 'Creative work',
    icon: '◐',
    desc: 'Writing, music theory, art, songwriting',
    details: 'Gemma 3 or Phi-4 (creative strength) + LLaVA multimodal (can see images). Switch to coding bundle at any time.',
  },
  {
    id: 'minimal',
    label: 'Minimal footprint',
    icon: '○',
    desc: 'Keep RAM usage as low as possible',
    details: 'Smallest models that still work. Sub-5GB total. Good for older hardware.',
  },
];

function StepUseCase({ onNext }: { onNext: (profile: UseCaseProfile) => void }) {
  const [selected, setSelected] = useState<UseCaseProfile | null>(null);

  return (
    <div>
      <p className="section-title mb-1">step 1 / 4</p>
      <h2 className="text-lg font-semibold mb-1">What will you use Lynx for?</h2>
      <p className="text-xs mb-6" style={{ color: 'var(--text-dim)' }}>
        This determines which local models are recommended. You can change it later.
      </p>

      <div className="space-y-1.5 mb-6">
        {USE_CASES.map((uc) => (
          <button
            key={uc.id}
            onClick={() => setSelected(uc.id)}
            className="w-full text-left rounded p-3 transition-all"
            style={{
              background: selected === uc.id ? 'var(--surface2)' : 'var(--bg)',
              border: `1px solid ${selected === uc.id ? 'var(--purple)' : 'var(--border)'}`,
            }}
          >
            <div className="flex items-start gap-3">
              <span className="font-mono mt-0.5" style={{ color: selected === uc.id ? 'var(--purple-hi)' : 'var(--text-mute)' }}>
                {uc.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium" style={{ color: selected === uc.id ? 'var(--text)' : 'var(--text-dim)' }}>
                    {uc.label}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-mute)' }}>{uc.desc}</span>
                </div>
                <AnimatePresence>
                  {selected === uc.id && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-xs mt-1 font-mono"
                      style={{ color: 'var(--text-mute)' }}
                    >
                      {uc.details}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              {selected === uc.id && (
                <span style={{ color: 'var(--teal)', fontSize: 12 }}>✓</span>
              )}
            </div>
          </button>
        ))}
      </div>

      <button
        className="btn btn-primary"
        disabled={!selected}
        onClick={() => selected && onNext(selected)}
      >
        Continue →
      </button>
    </div>
  );
}

// ─── Step 1: Project ──────────────────────────────────────────────────────────

function StepProject({ onNext, onBack }: {
  onNext: (path: string, type?: string) => void;
  onBack: () => void;
}) {
  const [path, setPath] = useState('');
  const [detected, setDetected] = useState<{ type: string; exists: boolean } | null>(null);
  const [validating, setValidating] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const validateTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validate = async (p: string) => {
    if (!p.trim()) { setDetected(null); return; }
    setValidating(true);
    try {
      const r = await fetch('/api/setup/detect-project', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: p.trim() }),
      });
      if (r.ok) setDetected(await r.json());
    } catch { setDetected(null); }
    finally { setValidating(false); }
  };

  const onPathChange = (v: string) => {
    setPath(v);
    if (validateTimer.current) clearTimeout(validateTimer.current);
    validateTimer.current = setTimeout(() => validate(v), 400);
  };

  const onFolderPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const firstPath = files[0].webkitRelativePath;
    const rootName  = firstPath.split('/')[0];
    setPath(`~/${rootName}`);
    const names = Array.from(files).map((f) => f.name);
    let type = 'unknown';
    if (names.includes('package.json'))      type = 'node';
    if (names.includes('pyproject.toml') || names.includes('requirements.txt')) type = 'python';
    if (names.includes('Cargo.toml'))        type = 'rust';
    if (names.includes('go.mod'))            type = 'go';
    if (names.includes('pom.xml'))           type = 'java';
    setDetected({ type, exists: true });
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name;
    let type = 'unknown';
    if (name === 'package.json') type = 'node';
    if (name === 'pyproject.toml' || name === 'requirements.txt') type = 'python';
    if (name === 'Cargo.toml') type = 'rust';
    if (name === 'go.mod') type = 'go';
    setDetected({ type, exists: true });
    setPath(`[selected: ${file.name}]`);
  };

  return (
    <div>
      <BackBtn onClick={onBack} />

      <p className="section-title mb-1">step 2 / 4</p>
      <h2 className="text-lg font-semibold mb-1">Connect your project</h2>
      <p className="text-xs mb-6" style={{ color: 'var(--text-dim)' }}>
        Lynx needs read access to your project to run tests, scan code, and build AI context.
      </p>

      <label className="block text-xs mb-1.5 font-mono" style={{ color: 'var(--text-dim)' }}>
        PROJECT PATH
      </label>
      <div className="relative mb-1">
        <input
          type="text"
          className="w-full font-mono"
          style={{ paddingRight: 90 }}
          placeholder="/home/you/projects/my-app"
          value={path}
          onChange={(e) => onPathChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && path.trim() && onNext(path.trim(), detected?.type)}
          autoFocus
        />
        {validating && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono" style={{ color: 'var(--text-mute)' }}>
            checking…
          </span>
        )}
      </div>

      <AnimatePresence>
        {detected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-xs font-mono mb-4 flex items-center gap-2"
            style={{ color: detected.exists ? 'var(--teal)' : 'var(--red)' }}
          >
            <span>{detected.exists ? '✓' : '✗'}</span>
            <span>{detected.exists ? `detected: ${detected.type} project` : 'path not found'}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2 mb-5">
        <button className="btn btn-ghost text-xs flex-1" onClick={() => folderInputRef.current?.click()}>
          <span style={{ color: 'var(--text-dim)' }}>⊞</span> Browse folder
        </button>
        <button className="btn btn-ghost text-xs flex-1" onClick={() => fileInputRef.current?.click()}>
          <span style={{ color: 'var(--text-dim)' }}>◈</span> Select file
        </button>
      </div>

      <div
        className="rounded p-3 mb-6 text-xs font-mono"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-mute)' }}
      >
        <span style={{ color: 'var(--purple)' }}>tip </span>
        run <span style={{ color: 'var(--text-dim)' }}>pwd</span> in your terminal to get the full path
      </div>

      <input ref={folderInputRef} type="file"
        // @ts-ignore
        webkitdirectory="" style={{ display: 'none' }} onChange={onFolderPick} />
      <input ref={fileInputRef} type="file"
        accept=".json,.toml,.yaml,.yml,.mod,Gemfile,Cargo.toml,go.mod"
        style={{ display: 'none' }} onChange={onFilePick} />

      <div className="flex gap-3">
        <button
          className="btn btn-primary"
          onClick={() => onNext(path.trim(), detected?.type)}
          disabled={!path.trim()}
        >
          Continue →
        </button>
        <button className="btn btn-ghost" onClick={() => onNext('', undefined)}>
          Skip
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: AI Architecture + Bundle ────────────────────────────────────────

const ORCHESTRATORS: Array<{
  id: OrchestratorProvider;
  label: string;
  tag: string;
  tagStyle: React.CSSProperties;
  desc: string;
  needsKey: boolean;
  keyLabel?: string;
  keyPlaceholder?: string;
}> = [
  {
    id: 'groq',
    label: 'Groq API',
    tag: 'FREE',
    tagStyle: { background: 'var(--teal-lo)', color: 'var(--teal)', border: '1px solid rgba(29,184,124,0.3)' },
    desc: 'Llama 3.3 70B · free · fastest option',
    needsKey: true, keyLabel: 'GROQ API KEY', keyPlaceholder: 'gsk_••••••••••••••••',
  },
  {
    id: 'claude-api',
    label: 'Claude API',
    tag: 'BEST',
    tagStyle: { background: 'rgba(212,160,23,0.15)', color: 'var(--amber)', border: '1px solid rgba(212,160,23,0.3)' },
    desc: 'Claude Opus · best reasoning · extended thinking',
    needsKey: true, keyLabel: 'ANTHROPIC API KEY', keyPlaceholder: 'sk-ant-••••••••••••••••',
  },
  {
    id: 'claude-cli',
    label: 'Claude CLI',
    tag: 'PRO',
    tagStyle: { background: 'rgba(212,160,23,0.1)', color: 'var(--amber)', border: '1px solid rgba(212,160,23,0.2)' },
    desc: 'Uses your existing Claude Pro/Team subscription',
    needsKey: false,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    tag: 'GPT-4o',
    tagStyle: { background: 'var(--purple-lo)', color: 'var(--purple-hi)', border: '1px solid rgba(124,111,205,0.3)' },
    desc: 'GPT-4o · reliable · widely tested',
    needsKey: true, keyLabel: 'OPENAI API KEY', keyPlaceholder: 'sk-••••••••••••••••',
  },
  {
    id: 'none',
    label: 'Skip for now',
    tag: '',
    tagStyle: {},
    desc: 'Local executor only. Brain features limited.',
    needsKey: false,
  },
];

// ─── Bundle catalog (mirrors packages/core/src/model-bundles.ts) ─────────────
const BUNDLES: BundleInfo[] = [
  // ── CPU ──────────────────────────────────────────────────────────────────
  {
    id: 'minimal', name: 'Minimal', tier: 'cpu',
    description: 'Fits in 8GB RAM. Serial only. Close other apps when running reasoner.',
    minRamGb: 6, parallelRamGb: 999,
    suitableFor: ['minimal', 'coding-heavy', 'balanced'],
    models: {
      general:      { tag: 'phi3.5:3.8b-mini-instruct-q4_K_M',      name: 'Phi-3.5 Mini 3.8B',   ramRequired: 2.5, role: 'general',      speed: 'fast',   notes: '90% of daily tasks at 2.3GB' },
      coder:        { tag: 'qwen2.5-coder:3b-instruct-q4_K_M',       name: 'Qwen 2.5 Coder 3B',  ramRequired: 2.5, role: 'coder',        speed: 'fast',   notes: 'Top coding benchmarks for 8GB' },
      autocomplete: { tag: 'deepseek-coder:1.3b-instruct-q4_K_M',    name: 'DeepSeek Coder 1.3B', ramRequired: 1.2, role: 'autocomplete', speed: 'fast',   notes: 'Background inline completions' },
      reasoner:     { tag: 'deepseek-r1:8b-q4_K_M',                  name: 'DeepSeek R1 8B',      ramRequired: 5.0, role: 'reasoner',     speed: 'slow',   notes: 'Chain-of-thought. Close other apps.' },
    },
  },
  {
    id: 'standard', name: 'Standard', tier: 'cpu',
    description: '16GB RAM. Best balance of quality and speed. Parallel capable.',
    minRamGb: 14, parallelRamGb: 16,
    suitableFor: ['coding-heavy', 'balanced', 'research'],
    models: {
      general:      { tag: 'llama3.1:8b-instruct-q4_K_M',            name: 'Llama 3.1 8B',        ramRequired: 5.5, role: 'general',      speed: 'medium', notes: 'Strong general model, 32K context' },
      coder:        { tag: 'qwen2.5-coder:7b-instruct-q4_K_M',       name: 'Qwen 2.5 Coder 7B',  ramRequired: 4.5, role: 'coder',        speed: 'medium', notes: 'Best 7B coder. Superior at debugging.' },
      autocomplete: { tag: 'qwen2.5-coder:1.5b-instruct-q4_K_M',     name: 'Qwen 2.5 Coder 1.5B',ramRequired: 1.5, role: 'autocomplete', speed: 'fast',   notes: 'Better quality than DeepSeek 1.3B' },
      reasoner:     { tag: 'deepseek-r1:14b-q4_K_M',                 name: 'DeepSeek R1 14B',     ramRequired: 9.0, role: 'reasoner',     speed: 'slow',   notes: 'Excellent reasoning, 16K context' },
    },
  },
  {
    id: 'workstation', name: 'Workstation', tier: 'cpu',
    description: '24GB RAM, no GPU. All local, no sacrifices.',
    minRamGb: 20, parallelRamGb: 24,
    suitableFor: ['coding-heavy', 'balanced', 'research'],
    models: {
      general:      { tag: 'llama3.1:8b-instruct-q4_K_M',            name: 'Llama 3.1 8B',        ramRequired: 5.5, role: 'general',      speed: 'medium', notes: '32K context' },
      coder:        { tag: 'qwen2.5-coder:14b-instruct-q4_K_M',      name: 'Qwen 2.5 Coder 14B', ramRequired: 9.0, role: 'coder',        speed: 'medium', notes: 'Near-GPT-4 coding quality' },
      autocomplete: { tag: 'qwen2.5-coder:1.5b-instruct-q4_K_M',     name: 'Qwen 2.5 Coder 1.5B',ramRequired: 1.5, role: 'autocomplete', speed: 'fast',   notes: 'Always-warm in background' },
      reasoner:     { tag: 'deepseek-r1:14b-q4_K_M',                 name: 'DeepSeek R1 14B',     ramRequired: 9.0, role: 'reasoner',     speed: 'slow',   notes: 'Complex debugging + analysis' },
    },
  },
  {
    id: 'power-cpu', name: 'Power (CPU)', tier: 'cpu',
    description: '32GB+ RAM, no GPU. Near-GPT-4 local without a graphics card.',
    minRamGb: 28, parallelRamGb: 32,
    suitableFor: ['coding-heavy', 'research', 'balanced'],
    models: {
      general:      { tag: 'llama3.1:8b-instruct-q4_K_M',            name: 'Llama 3.1 8B',        ramRequired: 5.5, role: 'general',      speed: 'medium', notes: '' },
      coder:        { tag: 'qwen2.5-coder:32b-instruct-q4_K_M',      name: 'Qwen 2.5 Coder 32B', ramRequired: 20,  role: 'coder',        speed: 'slow',   notes: 'Flagship coding. GPT-4-level.' },
      autocomplete: { tag: 'qwen2.5-coder:1.5b-instruct-q4_K_M',     name: 'Qwen 2.5 Coder 1.5B',ramRequired: 1.5, role: 'autocomplete', speed: 'fast',   notes: '' },
      reasoner:     { tag: 'qwq:32b-q4_K_M',                         name: 'QwQ 32B',             ramRequired: 20,  role: 'reasoner',     speed: 'slow',   notes: 'Near-o1 reasoning quality' },
    },
  },
  {
    id: 'general-only', name: 'General Use', tier: 'cpu',
    description: '4GB RAM. Chat and writing. No coding models.',
    minRamGb: 4, parallelRamGb: 8,
    suitableFor: ['general-use'],
    models: {
      general:  { tag: 'llama3.2:3b-instruct-q4_K_M',                name: 'Llama 3.2 3B',        ramRequired: 2.5, role: 'general',  speed: 'fast', notes: 'Fast, multilingual, 8K context' },
      reasoner: { tag: 'deepseek-r1:7b-q4_K_M',                      name: 'DeepSeek R1 7B',      ramRequired: 4.5, role: 'reasoner', speed: 'slow', notes: 'Chain-of-thought for analysis' },
    },
  },
  {
    id: 'creative-studio', name: 'Creative Studio', tier: 'cpu',
    description: '16GB RAM. Writing, music, art. LLaVA multimodal included — paste in images.',
    minRamGb: 12, parallelRamGb: 16,
    suitableFor: ['creative'],
    models: {
      general:    { tag: 'llama3.1:8b-instruct-q4_K_M',              name: 'Llama 3.1 8B',        ramRequired: 5.5, role: 'general',    speed: 'medium', notes: 'General tasks + fast chat' },
      creative:   { tag: 'gemma3:12b-it-q4_K_M',                     name: 'Gemma 3 12B',         ramRequired: 8.0, role: 'creative',   speed: 'medium', notes: 'Google\'s creative model. Poetry, lyrics, stories.' },
      reasoner:   { tag: 'deepseek-r1:7b-q4_K_M',                    name: 'DeepSeek R1 7B',      ramRequired: 4.5, role: 'reasoner',   speed: 'slow',   notes: 'Music theory, analysis, critique' },
      multimodal: { tag: 'llava:7b-v1.6-q4_K_M',                     name: 'LLaVA 7B',            ramRequired: 5.0, role: 'multimodal', speed: 'medium', notes: 'See images — paste art references, mockups, photos' },
    },
  },
  {
    id: 'creative-studio-lite', name: 'Creative Lite', tier: 'cpu',
    description: '8GB RAM. Lean creative setup without vision model.',
    minRamGb: 6, parallelRamGb: 999,
    suitableFor: ['creative', 'general-use'],
    models: {
      general:  { tag: 'llama3.2:3b-instruct-q4_K_M',                name: 'Llama 3.2 3B',        ramRequired: 2.5, role: 'general',  speed: 'fast',   notes: 'Fast general chat' },
      creative: { tag: 'llama3.1:8b-instruct-q4_K_M',                name: 'Llama 3.1 8B',        ramRequired: 5.5, role: 'creative', speed: 'medium', notes: 'Versatile for creative writing' },
      reasoner: { tag: 'deepseek-r1:7b-q4_K_M',                      name: 'DeepSeek R1 7B',      ramRequired: 4.5, role: 'reasoner', speed: 'slow',   notes: 'For music theory, analysis' },
    },
  },

  // ── Consumer GPU ──────────────────────────────────────────────────────────
  {
    id: 'gpu-consumer', name: 'GPU — Consumer', tier: 'gpu-consumer',
    description: 'RTX 4070 Ti Super / 4080 / 4090 (16–24GB VRAM) + 32GB RAM. 70B class local.',
    minRamGb: 24, parallelRamGb: 32, minVramGb: 12,
    suitableFor: ['coding-heavy', 'balanced', 'research'],
    models: {
      general:      { tag: 'llama3.3:70b-instruct-q4_K_M',           name: 'Llama 3.3 70B',       ramRequired: 40,  role: 'general',      speed: 'slow',   notes: 'GPU-layered. 128K context. Near-cloud quality.' },
      coder:        { tag: 'qwen2.5-coder:32b-instruct-q4_K_M',      name: 'Qwen 2.5 Coder 32B', ramRequired: 20,  role: 'coder',        speed: 'medium', notes: 'Flagship coding. GPT-4-level code gen.' },
      autocomplete: { tag: 'qwen2.5-coder:1.5b-instruct-q4_K_M',     name: 'Qwen 2.5 Coder 1.5B',ramRequired: 1.5, role: 'autocomplete', speed: 'fast',   notes: 'Always-warm, sub-100ms' },
      reasoner:     { tag: 'deepseek-r1:32b-q4_K_M',                 name: 'DeepSeek R1 32B',     ramRequired: 20,  role: 'reasoner',     speed: 'slow',   notes: 'GPU-accelerated. Near-o1 quality.' },
    },
  },
  {
    id: 'gpu-consumer-creative', name: 'GPU — Consumer Creative', tier: 'gpu-consumer',
    description: 'RTX 4070 Ti Super / 4080 / 4090. Full creative + LLaVA 34B vision.',
    minRamGb: 20, parallelRamGb: 28, minVramGb: 12,
    suitableFor: ['creative', 'research'],
    models: {
      general:    { tag: 'llama3.3:70b-instruct-q4_K_M',             name: 'Llama 3.3 70B',       ramRequired: 40,  role: 'general',    speed: 'slow',   notes: '128K context' },
      creative:   { tag: 'phi4:14b-q4_K_M',                          name: 'Microsoft Phi-4 14B', ramRequired: 9.0, role: 'creative',   speed: 'medium', notes: 'Exceptional for music theory, worldbuilding, deep creative reasoning' },
      reasoner:   { tag: 'deepseek-r1:14b-q4_K_M',                   name: 'DeepSeek R1 14B',     ramRequired: 9.0, role: 'reasoner',   speed: 'slow',   notes: 'Analysis + critique' },
      multimodal: { tag: 'llava:34b-v1.6-q4_K_M',                    name: 'LLaVA 34B',           ramRequired: 22,  role: 'multimodal', speed: 'slow',   notes: 'Best local image understanding. Art reference, UI analysis.' },
    },
  },

  // ── Workstation GPU ───────────────────────────────────────────────────────
  {
    id: 'gpu-workstation', name: 'GPU — Workstation', tier: 'gpu-workstation',
    description: 'RTX 6000 Ada / A40 / A6000 (48GB VRAM) + 64GB RAM. Qwen 2.5 72B fully in VRAM.',
    minRamGb: 48, parallelRamGb: 64, minVramGb: 24,
    suitableFor: ['coding-heavy', 'balanced', 'research'],
    models: {
      general:      { tag: 'qwen2.5:72b-instruct-q4_K_M',            name: 'Qwen 2.5 72B',        ramRequired: 45,  role: 'general',      speed: 'slow',   notes: 'Fully in VRAM. Near-GPT-4o quality.' },
      coder:        { tag: 'qwen2.5-coder:32b-instruct-q4_K_M',      name: 'Qwen 2.5 Coder 32B', ramRequired: 20,  role: 'coder',        speed: 'medium', notes: 'GPT-4-level coding. Parallel with general.' },
      autocomplete: { tag: 'qwen2.5-coder:1.5b-instruct-q4_K_M',     name: 'Qwen 2.5 Coder 1.5B',ramRequired: 1.5, role: 'autocomplete', speed: 'fast',   notes: '' },
      reasoner:     { tag: 'deepseek-r1:70b-q4_K_M',                 name: 'DeepSeek R1 70B',     ramRequired: 42,  role: 'reasoner',     speed: 'slow',   notes: 'Best open-source reasoning. Matches o1.' },
    },
  },
  {
    id: 'gpu-workstation-creative', name: 'GPU — Workstation Creative', tier: 'gpu-workstation',
    description: 'RTX 6000 Ada / A40 (48GB VRAM). Qwen 72B + Mistral Nemo 128K + LLaVA 34B.',
    minRamGb: 32, parallelRamGb: 48, minVramGb: 24,
    suitableFor: ['creative', 'research', 'balanced'],
    models: {
      general:    { tag: 'qwen2.5:72b-instruct-q4_K_M',              name: 'Qwen 2.5 72B',        ramRequired: 45,  role: 'general',    speed: 'slow',   notes: 'Near-GPT-4o. Fully in VRAM.' },
      creative:   { tag: 'mistral-nemo:12b-instruct-2407-q4_K_M',    name: 'Mistral Nemo 12B',    ramRequired: 8.0, role: 'creative',   speed: 'medium', notes: '128K context. Write entire novels. Full song albums.' },
      reasoner:   { tag: 'deepseek-r1:32b-q4_K_M',                   name: 'DeepSeek R1 32B',     ramRequired: 20,  role: 'reasoner',   speed: 'slow',   notes: 'Deep analysis + critique' },
      multimodal: { tag: 'llava:34b-v1.6-q4_K_M',                    name: 'LLaVA 34B',           ramRequired: 22,  role: 'multimodal', speed: 'slow',   notes: 'Analyze artwork, architecture, fashion, reference images' },
    },
  },

  // ── Datacenter ────────────────────────────────────────────────────────────
  {
    id: 'gpu-datacenter', name: 'GPU — Datacenter', tier: 'gpu-datacenter',
    description: 'H100 / H200 / A100 80GB+. 405B class. Everything in VRAM, fully parallel.',
    minRamGb: 128, parallelRamGb: 256, minVramGb: 80,
    suitableFor: ['coding-heavy', 'research', 'balanced'],
    models: {
      general:      { tag: 'llama3.1:405b-instruct-q4_K_M',          name: 'Llama 3.1 405B',      ramRequired: 230, role: 'general',      speed: 'slow',   notes: 'Meta\'s flagship. Requires multi-GPU.' },
      coder:        { tag: 'qwen2.5-coder:32b-instruct-q4_K_M',      name: 'Qwen 2.5 Coder 32B', ramRequired: 20,  role: 'coder',        speed: 'fast',   notes: 'Fast at this scale — VRAM bandwidth.' },
      autocomplete: { tag: 'qwen2.5-coder:1.5b-instruct-q4_K_M',     name: 'Qwen 2.5 Coder 1.5B',ramRequired: 1.5, role: 'autocomplete', speed: 'fast',   notes: '' },
      reasoner:     { tag: 'deepseek-r1:70b-q4_K_M',                 name: 'DeepSeek R1 70B',     ramRequired: 42,  role: 'reasoner',     speed: 'medium', notes: 'Fast at datacenter scale' },
    },
  },
  {
    id: 'gpu-datacenter-extreme', name: 'GPU — Extreme', tier: 'gpu-datacenter',
    description: 'Multi-H100 / DGX node. 1TB RAM. Everything simultaneously, full precision.',
    minRamGb: 512, parallelRamGb: 512, minVramGb: 160,
    suitableFor: ['coding-heavy', 'research', 'balanced', 'creative'],
    models: {
      general:    { tag: 'llama3.1:405b-instruct-q4_K_M',            name: 'Llama 3.1 405B',      ramRequired: 230, role: 'general',    speed: 'medium', notes: 'No compromises.' },
      coder:      { tag: 'qwen2.5-coder:32b-instruct-q4_K_M',        name: 'Qwen 2.5 Coder 32B', ramRequired: 20,  role: 'coder',      speed: 'fast',   notes: '' },
      reasoner:   { tag: 'deepseek-r1:70b-q4_K_M',                   name: 'DeepSeek R1 70B',     ramRequired: 42,  role: 'reasoner',   speed: 'medium', notes: '' },
      creative:   { tag: 'gemma3:12b-it-q4_K_M',                     name: 'Gemma 3 12B',         ramRequired: 8.0, role: 'creative',   speed: 'fast',   notes: 'Always warm, instant creative responses' },
      multimodal: { tag: 'llava:34b-v1.6-q4_K_M',                    name: 'LLaVA 34B',           ramRequired: 22,  role: 'multimodal', speed: 'medium', notes: '' },
    },
  },
];

const ROLE_COLORS: Record<string, string> = {
  general:      'var(--text-dim)',
  coder:        'var(--purple-hi)',
  autocomplete: 'var(--teal)',
  reasoner:     'var(--amber)',
  creative:     '#e879a0',
  multimodal:   '#60a5fa',
};

const TIER_LABELS: Record<string, string> = {
  'cpu':              'CPU',
  'gpu-consumer':     'Consumer GPU',
  'gpu-workstation':  'Workstation GPU',
  'gpu-datacenter':   'Datacenter',
};

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'cpu':             { bg: 'var(--surface2)',                   text: 'var(--text-mute)',  border: 'var(--border)' },
  'gpu-consumer':    { bg: 'rgba(29,184,124,0.08)',             text: 'var(--teal)',       border: 'rgba(29,184,124,0.25)' },
  'gpu-workstation': { bg: 'rgba(127,119,221,0.1)',             text: 'var(--purple-hi)',  border: 'rgba(127,119,221,0.3)' },
  'gpu-datacenter':  { bg: 'rgba(212,160,23,0.1)',              text: 'var(--amber)',      border: 'rgba(212,160,23,0.3)' },
};

function BundleCard({ bundle, selected, ramGb, vramGb = 0, onSelect, expanded = false }: {
  bundle: BundleInfo;
  selected: boolean;
  ramGb: number;
  vramGb?: number;
  onSelect: () => void;
  expanded?: boolean;
}) {
  const effectiveRam = ramGb + vramGb * 0.8;
  const viable     = effectiveRam >= bundle.minRamGb && (!bundle.minVramGb || vramGb >= bundle.minVramGb);
  const canParallel = effectiveRam >= bundle.parallelRamGb && bundle.parallelRamGb !== 999;
  const modelList   = Object.entries(bundle.models);
  const totalRam    = modelList.reduce((s, [, m]) => s + m.ramRequired, 0);
  const tierStyle   = TIER_COLORS[bundle.tier];

  return (
    <button
      onClick={onSelect}
      disabled={!viable}
      className="w-full text-left rounded p-3 transition-all"
      style={{
        background: selected ? 'var(--surface2)' : viable ? 'var(--bg)' : 'rgba(0,0,0,0.15)',
        border: `1px solid ${selected ? 'var(--purple)' : viable ? 'var(--border)' : 'var(--border)'}`,
        opacity: viable ? 1 : 0.4,
        cursor: viable ? 'pointer' : 'not-allowed',
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold" style={{ color: selected ? 'var(--text)' : 'var(--text-dim)' }}>
            {bundle.name}
          </span>
          <span className="badge" style={{ ...tierStyle, fontSize: 9, padding: '0 4px' }}>
            {TIER_LABELS[bundle.tier]}
          </span>
        </div>
        <div className="flex gap-1 flex-shrink-0 items-center">
          {!viable && bundle.minVramGb && (
            <span className="badge" style={{ background: 'rgba(216,90,48,0.12)', color: 'var(--red)', border: '1px solid rgba(216,90,48,0.3)', fontSize: 9 }}>
              {bundle.minVramGb}GB VRAM
            </span>
          )}
          {!viable && !bundle.minVramGb && (
            <span className="badge" style={{ background: 'rgba(216,90,48,0.12)', color: 'var(--red)', border: '1px solid rgba(216,90,48,0.3)', fontSize: 9 }}>
              need {bundle.minRamGb}GB
            </span>
          )}
          {viable && canParallel && (
            <span className="badge" style={{ background: 'var(--teal-lo)', color: 'var(--teal)', border: '1px solid rgba(29,184,124,0.3)', fontSize: 9 }}>
              parallel
            </span>
          )}
          {selected && <span style={{ color: 'var(--teal)', fontSize: 12 }}>✓</span>}
        </div>
      </div>

      <p className="text-xs mb-2" style={{ color: 'var(--text-mute)', fontSize: 11 }}>{bundle.description}</p>

      {/* Model list */}
      <div className="space-y-0.5">
        {modelList.map(([role, m]) => (
          <div key={role} className="font-mono" style={{ fontSize: 10 }}>
            <div className="flex items-center justify-between">
              <span style={{ color: ROLE_COLORS[role] ?? 'var(--text-mute)', minWidth: 72 }}>{role}</span>
              <span style={{ color: 'var(--text-dim)', flex: 1, marginLeft: 4 }}>{m.name}</span>
              <span style={{ color: 'var(--text-mute)' }}>{m.ramRequired}GB</span>
            </div>
            {expanded && m.notes && (
              <div style={{ color: 'rgba(152,150,200,0.4)', paddingLeft: 76, fontSize: 9, marginBottom: 1 }}>
                {m.notes}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 font-mono" style={{ color: 'var(--text-mute)', fontSize: 9 }}>
        {totalRam.toFixed(0)}GB serial · {bundle.minRamGb}GB min
        {canParallel ? ' · parallel ✓' : viable ? ' · serial only' : ''}
        {bundle.minVramGb ? ` · ${bundle.minVramGb}GB+ VRAM` : ''}
      </div>
    </button>
  );
}

function StepLLM({ useCase, onNext, onBack }: {
  useCase: UseCaseProfile;
  onNext: (cfg: LynxConfig['orchestrator'] & { executor: LynxConfig['executor'] }) => void;
  onBack: () => void;
}) {
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [orchestratorId, setOrchestratorId] = useState<OrchestratorProvider>('groq');
  const [apiKey, setApiKey] = useState('');
  const [executorProvider, setExecutorProvider] = useState<ExecutorProvider>('ollama');
  const [bundleId, setBundleId] = useState<string>('');
  const [tab, setTab] = useState<'orchestrator' | 'bundle'>('orchestrator');

  useEffect(() => {
    fetch('/api/setup/system-info')
      .then(r => r.json())
      .then((d: SystemInfo) => {
        setSysInfo(d);
        // Auto-select best bundle for RAM + use-case
        const viable = BUNDLES
          .filter(b => d.ram >= b.minRamGb && b.suitableFor.includes(useCase))
          .sort((a, x) => x.minRamGb - a.minRamGb);
        if (viable[0]) setBundleId(viable[0].id);
        else setBundleId(BUNDLES[0].id); // fallback: minimal
      })
      .catch(() => {
        setSysInfo({ ram: 8, cpus: 4, recommendations: [] });
        setBundleId('minimal');
      });
  }, [useCase]);

  const orch = ORCHESTRATORS.find(o => o.id === orchestratorId)!;
  const selectedBundle = BUNDLES.find(b => b.id === bundleId);
  const ram = sysInfo?.ram ?? 8;

  const submit = () => {
    const primaryModel = selectedBundle
      ? (selectedBundle.models['coder'] ?? selectedBundle.models['general'])?.tag
      : undefined;
    onNext({
      provider: orchestratorId,
      apiKey: apiKey || undefined,
      executor: {
        provider: executorProvider,
        model: primaryModel,
        bundleId: executorProvider === 'ollama' ? bundleId : undefined,
      },
    });
  };

  return (
    <div>
      <BackBtn onClick={onBack} />

      <p className="section-title mb-1">step 3 / 4</p>
      <h2 className="text-lg font-semibold mb-1">AI architecture</h2>
      <p className="text-xs mb-4" style={{ color: 'var(--text-dim)' }}>
        The <span style={{ color: 'var(--purple-hi)' }}>orchestrator</span> plans and reasons at full cloud quality.
        The <span style={{ color: 'var(--teal)' }}>executor</span> (local) handles the heavy work privately.
      </p>

      {/* Architecture flow */}
      <div
        className="rounded p-3 mb-5 text-xs font-mono flex items-center justify-between gap-1"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
      >
        <div className="text-center">
          <div style={{ color: 'var(--purple-hi)', marginBottom: 2 }}>ORCHESTRATOR</div>
          <div style={{ color: 'var(--text-mute)', fontSize: 10 }}>plans · reasons · decides</div>
          <div style={{ color: 'var(--text-mute)', fontSize: 10 }}>full GPT/Claude quality</div>
        </div>
        <div style={{ color: 'var(--border-lit)' }}>──→</div>
        <div className="text-center">
          <div style={{ color: 'var(--teal)', marginBottom: 2 }}>MESH ROUTER</div>
          <div style={{ color: 'var(--text-mute)', fontSize: 10 }}>classifies task</div>
        </div>
        <div style={{ color: 'var(--border-lit)' }}>──→</div>
        <div className="text-center">
          <div style={{ color: 'var(--teal)', marginBottom: 2 }}>SPECIALIST</div>
          <div style={{ color: 'var(--text-mute)', fontSize: 10 }}>coder / reasoner / general</div>
          <div style={{ color: 'var(--text-mute)', fontSize: 10 }}>local · private · free</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {(['orchestrator', 'bundle'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="text-xs font-mono px-3 py-1.5 rounded transition-colors"
            style={{
              background: tab === t ? 'var(--surface2)' : 'transparent',
              border: `1px solid ${tab === t ? 'var(--border-lit)' : 'var(--border)'}`,
              color: tab === t ? 'var(--text)' : 'var(--text-mute)',
            }}
          >
            {t === 'orchestrator' ? 'Orchestrator (brain)' : 'Local bundle (hands)'}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'orchestrator' && (
          <motion.div key="orch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="space-y-1.5 mb-4">
              {ORCHESTRATORS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => { setOrchestratorId(o.id); setApiKey(''); }}
                  className="w-full text-left rounded p-2.5 transition-all"
                  style={{
                    background: orchestratorId === o.id ? 'var(--surface2)' : 'var(--bg)',
                    border: `1px solid ${orchestratorId === o.id ? 'var(--purple)' : 'var(--border)'}`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: orchestratorId === o.id ? 'var(--text)' : 'var(--text-dim)' }}>
                      {o.label}
                    </span>
                    {o.tag && (
                      <span className="badge" style={{ ...o.tagStyle, fontSize: 10, padding: '0 5px' }}>
                        {o.tag}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-mute)', fontSize: 11 }}>{o.desc}</p>
                </button>
              ))}
            </div>

            <AnimatePresence>
              {orch.needsKey && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4"
                >
                  <label className="block text-xs mb-1.5 font-mono" style={{ color: 'var(--text-dim)' }}>
                    {orch.keyLabel}
                  </label>
                  <input
                    type="password"
                    className="w-full font-mono text-xs"
                    placeholder={orch.keyPlaceholder}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  {orchestratorId === 'groq' && (
                    <p className="text-xs mt-1 font-mono" style={{ color: 'var(--text-mute)' }}>
                      free at console.groq.com → API Keys
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {orchestratorId === 'groq' && (
              <div
                className="rounded p-2.5 text-xs"
                style={{ background: 'rgba(29,184,124,0.06)', border: '1px solid rgba(29,184,124,0.2)' }}
              >
                <span style={{ color: 'var(--teal)' }}>✓ recommended</span>
                <span className="ml-2" style={{ color: 'var(--text-dim)' }}>
                  Groq is free and runs Llama 3.3 70B — the same reasoning quality as GPT-4.
                  Your code stays local; only the task description leaves your machine.
                </span>
              </div>
            )}
          </motion.div>
        )}

        {tab === 'bundle' && (
          <motion.div key="bundle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {sysInfo && (
              <div
                className="rounded p-2 mb-3 text-xs font-mono flex items-center gap-3"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}
              >
                <span><span style={{ color: 'var(--purple)' }}>sys </span>{ram}GB RAM{sysInfo.gpuVram ? ` · ${sysInfo.gpuVram}GB VRAM` : ''} · {sysInfo.cpus} cores</span>
                <span style={{ color: 'var(--border-lit)' }}>|</span>
                <span><span style={{ color: 'var(--purple)' }}>profile </span>{useCase}</span>
              </div>
            )}

            {/* Executor toggle */}
            <div className="flex gap-1.5 mb-3">
              <button
                onClick={() => setExecutorProvider('ollama')}
                className="flex-1 text-xs rounded p-2 transition-all"
                style={{
                  background: executorProvider === 'ollama' ? 'rgba(29,184,124,0.08)' : 'var(--bg)',
                  border: `1px solid ${executorProvider === 'ollama' ? 'rgba(29,184,124,0.4)' : 'var(--border)'}`,
                  color: executorProvider === 'ollama' ? 'var(--teal)' : 'var(--text-mute)',
                }}
              >
                Ollama (local)
              </button>
              <button
                onClick={() => setExecutorProvider('orchestrator')}
                className="flex-1 text-xs rounded p-2 transition-all"
                style={{
                  background: executorProvider === 'orchestrator' ? 'var(--surface2)' : 'var(--bg)',
                  border: `1px solid ${executorProvider === 'orchestrator' ? 'var(--border-lit)' : 'var(--border)'}`,
                  color: executorProvider === 'orchestrator' ? 'var(--text-dim)' : 'var(--text-mute)',
                }}
              >
                Use orchestrator
              </button>
            </div>

            <AnimatePresence>
              {executorProvider === 'ollama' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  {/* Tier sections */}
                  {(['cpu', 'gpu-consumer', 'gpu-workstation', 'gpu-datacenter'] as const).map(tier => {
                    const tierBundles = BUNDLES.filter(b => b.tier === tier);
                    const tierStyle   = TIER_COLORS[tier];
                    return (
                      <div key={tier} className="mb-4">
                        <div
                          className="flex items-center gap-2 mb-2"
                        >
                          <span
                            className="badge"
                            style={{ ...tierStyle, fontSize: 9, padding: '1px 6px', letterSpacing: '0.08em' }}
                          >
                            {TIER_LABELS[tier]}
                          </span>
                          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                        </div>
                        <div className="space-y-1.5">
                          {tierBundles.map((b) => (
                            <BundleCard
                              key={b.id}
                              bundle={b}
                              selected={bundleId === b.id}
                              ramGb={ram}
                              vramGb={sysInfo?.gpuVram}
                              onSelect={() => setBundleId(b.id)}
                              expanded={bundleId === b.id}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {selectedBundle && (
                    <div
                      className="rounded p-2.5 text-xs font-mono mt-1"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-mute)' }}
                    >
                      <div className="mb-1" style={{ color: 'var(--text-dim)' }}>to install this bundle:</div>
                      <span style={{ color: 'var(--purple)' }}>$ </span>
                      ./infra/scripts/install-models.sh {selectedBundle.id}
                    </div>
                  )}
                </motion.div>
              )}
              {executorProvider === 'orchestrator' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="rounded p-3 text-xs"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}
                >
                  The orchestrator handles everything — no Ollama needed. Simpler, but all requests go to the cloud.
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5">
        <button className="btn btn-primary" onClick={submit}>
          Continue →
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Notifications ────────────────────────────────────────────────────

function StepNotify({ onDone, onBack }: {
  onDone: (cfg: LynxConfig['notify']) => void;
  onBack: () => void;
}) {
  const [channel, setChannel] = useState('none');
  const [url, setUrl] = useState('');

  const channels = [
    { id: 'slack',   icon: '#',  label: 'Slack' },
    { id: 'discord', icon: '⊞', label: 'Discord' },
    { id: 'email',   icon: '@',  label: 'Email' },
    { id: 'webhook', icon: '⇒', label: 'Webhook' },
    { id: 'none',    icon: '○',  label: 'None' },
  ];

  return (
    <div>
      <BackBtn onClick={onBack} />

      <p className="section-title mb-1">step 4 / 4</p>
      <h2 className="text-lg font-semibold mb-1">Alert channel</h2>
      <p className="text-xs mb-6" style={{ color: 'var(--text-dim)' }}>
        Where should Lynx send error alerts and approval requests?
      </p>

      <div className="grid grid-cols-3 gap-1.5 mb-5">
        {channels.map((c) => (
          <button
            key={c.id}
            onClick={() => setChannel(c.id)}
            className="flex flex-col items-center gap-1.5 p-3 rounded transition-all"
            style={{
              background: channel === c.id ? 'var(--surface2)' : 'var(--bg)',
              border: `1px solid ${channel === c.id ? 'var(--purple)' : 'var(--border)'}`,
            }}
          >
            <span className="font-mono text-base" style={{ color: channel === c.id ? 'var(--purple-hi)' : 'var(--text-dim)' }}>
              {c.icon}
            </span>
            <span className="text-xs" style={{ color: channel === c.id ? 'var(--text)' : 'var(--text-dim)' }}>
              {c.label}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {channel !== 'none' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-5">
            <label className="block text-xs mb-1.5 font-mono" style={{ color: 'var(--text-dim)' }}>
              {channel === 'email' ? 'EMAIL ADDRESS' : 'WEBHOOK URL'}
            </label>
            <input
              type="text"
              className="w-full"
              placeholder={channel === 'email' ? 'you@company.com' : 'https://hooks.slack.com/…'}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-3">
        <button
          className="btn btn-primary"
          onClick={() => onDone({ channel, url: url || undefined })}
        >
          Launch Lynx →
        </button>
        <button className="btn btn-ghost" onClick={() => onDone({ channel: 'none' })}>
          Skip
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep]       = useState(0);
  const [partial, setPartial] = useState<Partial<LynxConfig>>({});

  const go = (n: number) => setStep(n);

  const step0Done = (profile: UseCaseProfile) => {
    setPartial(p => ({ ...p, useCase: profile }));
    go(1);
  };

  const step1Done = (path: string, type?: string) => {
    setPartial(p => ({ ...p, projectPath: path, projectType: type }));
    go(2);
  };

  const step2Done = (ai: LynxConfig['orchestrator'] & { executor: LynxConfig['executor'] }) => {
    setPartial(p => ({ ...p, orchestrator: { provider: ai.provider, apiKey: ai.apiKey }, executor: ai.executor }));
    go(3);
  };

  const step3Done = async (notify: LynxConfig['notify']) => {
    const final: LynxConfig = {
      useCase:      partial.useCase ?? 'balanced',
      projectPath:  partial.projectPath ?? '',
      projectType:  partial.projectType,
      orchestrator: partial.orchestrator ?? { provider: 'none' },
      executor:     partial.executor    ?? { provider: 'ollama' },
      notify,
    };
    try {
      await fetch('/api/setup/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(final),
      });
    } catch { /* non-fatal */ }
    localStorage.setItem('lynx_config', JSON.stringify(final));
    localStorage.setItem('lynx_setup_complete', '1');
    onComplete(final);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--bg)' }}
    >
      {/* Dot grid */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          opacity: 0.5,
        }}
      />

      <motion.div
        className="relative w-full"
        style={{ maxWidth: step === 2 ? 760 : 520 }}
        layout
        transition={{ duration: 0.25 }}
      >
        <div className="rounded-lg p-7" style={{ background: 'var(--surface)', border: '1px solid var(--border-lit)' }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, var(--purple), var(--teal))', boxShadow: '0 0 16px rgba(124,111,205,0.4)' }}
              >
                <span className="text-white font-bold text-xs font-mono">L</span>
              </div>
              <span className="text-sm font-semibold">Lynx</span>
            </div>
            <span className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>setup wizard</span>
          </div>

          <Steps current={step} />

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
            >
              {step === 0 && <StepUseCase onNext={step0Done} />}
              {step === 1 && <StepProject onNext={step1Done} onBack={() => go(0)} />}
              {step === 2 && <StepLLM useCase={partial.useCase ?? 'balanced'} onNext={step2Done} onBack={() => go(1)} />}
              {step === 3 && <StepNotify onDone={step3Done} onBack={() => go(2)} />}
            </motion.div>
          </AnimatePresence>
        </div>

        <p className="text-center mt-3 text-xs font-mono" style={{ color: 'var(--text-mute)' }}>
          MIT · open source · self-hosted · no telemetry
        </p>
      </motion.div>
    </div>
  );
}

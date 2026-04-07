/**
 * Lynx Provisioning Screen
 *
 * Shown after onboarding completes, before the main app.
 * Phases:
 *   1. check    — env + API key validation
 *   2. download — model pulls via Ollama SSE (or cloud connect)
 *   3. scan     — project directory analysis
 *   4. questions — AI asks 2 questions about the project
 *   5. done     — auto-advances to app
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FullConfig {
  useCase?: string;
  projectPath?: string;
  projectType?: string;
  orchestrator?: { provider: string; apiKey?: string };
  executor?: { provider: string; bundleId?: string; model?: string };
  notify?: { channel: string };
}

interface CheckItem {
  key: string;
  status: 'pending' | 'ok' | 'warn' | 'error';
  label: string;
  detail?: string;
}

interface ModelItem {
  tag: string;
  name: string;
  role: string;
  status: 'waiting' | 'pulling' | 'done' | 'exists' | 'error';
  progress: number;
  completed: number;
  total: number;
  error?: string;
}

interface ScanResult {
  files: number;
  testFiles: number;
  primaryLanguage: string;
  framework: string;
  topDirs: string[];
  languageBreakdown: Record<string, number>;
  entryPoints: string[];
  packageName?: string;
}

interface QuestionItem {
  id: string;
  q: string;
  a: string;
}

type Stage = 'check' | 'download' | 'scan' | 'questions' | 'done';

interface ProvisioningProps {
  config: FullConfig;
  onDone: (answers: Record<string, string>) => void;
}

// ─── Static fallback questions ─────────────────────────────────────────────────

const STATIC_QUESTIONS: QuestionItem[] = [
  { id: 'goal',      q: "What is the primary goal of this project?",                   a: '' },
  { id: 'painpoint', q: "What's the most painful thing about maintaining this codebase?", a: '' },
];

function questionsForProject(framework: string, language: string): QuestionItem[] {
  if (framework === 'next.js' || framework === 'react') {
    return [
      { id: 'goal',      q: "What is this React/Next.js app trying to accomplish?",      a: '' },
      { id: 'painpoint', q: "What component or data-fetching issue causes the most bugs?", a: '' },
    ];
  }
  if (language === 'Python') {
    return [
      { id: 'goal',      q: "What does this Python project do at a high level?",         a: '' },
      { id: 'painpoint', q: "Any specific performance or dependency issues to watch for?", a: '' },
    ];
  }
  if (framework === 'go' || language === 'Go') {
    return [
      { id: 'goal',      q: "What service does this Go project provide?",                a: '' },
      { id: 'painpoint', q: "Any concurrency or API surface areas that are tricky?",     a: '' },
    ];
  }
  return STATIC_QUESTIONS;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

const ROLE_COLOR: Record<string, string> = {
  general:      '#888',
  coder:        '#9d8fff',
  autocomplete: '#1db87c',
  reasoner:     '#d4a017',
  creative:     '#e879a0',
  multimodal:   '#60a5fa',
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function LynxIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <polygon points="8,20 14,4 20,18"  fill="url(#pv-g)" opacity="0.9" />
      <polygon points="40,20 34,4 28,18" fill="url(#pv-g)" opacity="0.9" />
      <path d="M8 20 Q6 36 24 44 Q42 36 40 20 Q34 14 24 14 Q14 14 8 20Z" fill="url(#pv-g)" />
      <ellipse cx="17" cy="26" rx="3.5" ry="2.5" fill="#07070f" />
      <ellipse cx="31" cy="26" rx="3.5" ry="2.5" fill="#07070f" />
      <ellipse cx="17" cy="26" rx="1.5" ry="2" fill="url(#pv-eye)" />
      <ellipse cx="31" cy="26" rx="1.5" ry="2" fill="url(#pv-eye)" />
      <defs>
        <linearGradient id="pv-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#52a87a" />
          <stop offset="100%" stopColor="#3d8b5e" />
        </linearGradient>
        <linearGradient id="pv-eye" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#52a87a" />
          <stop offset="100%" stopColor="#3d8b5e" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function StatusDot({ status }: { status: 'pending' | 'ok' | 'warn' | 'error' | 'pulling' | 'waiting' | 'done' | 'exists' }) {
  const map: Record<string, string> = {
    pending: 'var(--border-lit)',
    waiting: 'var(--border-lit)',
    ok:      'var(--teal)',
    done:    'var(--teal)',
    exists:  'var(--teal)',
    warn:    'var(--amber)',
    error:   'var(--red)',
    pulling: 'var(--purple-hi)',
  };
  const isPulsing = status === 'pulling' || status === 'pending';
  return (
    <span
      className={isPulsing ? 'pulse-dot' : ''}
      style={{
        display: 'inline-block',
        width: 6, height: 6,
        borderRadius: '50%',
        background: map[status] ?? 'var(--border-lit)',
        flexShrink: 0,
      }}
    />
  );
}

function ProgressBar({ value, color = 'var(--purple)' }: { value: number; color?: string }) {
  return (
    <div className="relative h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
      <motion.div
        className="absolute left-0 top-0 h-full rounded-full"
        style={{ background: color }}
        animate={{ width: `${Math.min(value * 100, 100)}%` }}
        transition={{ duration: 0.2 }}
      />
    </div>
  );
}

// ─── Stage: Check ─────────────────────────────────────────────────────────────

function CheckStage({ checks }: { checks: CheckItem[] }) {
  return (
    <div>
      <p className="section-title mb-3">environment check</p>
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {checks.map((c) => (
            <motion.div
              key={c.key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-start gap-2.5 text-xs"
            >
              <StatusDot status={c.status} />
              <div>
                <span style={{ color: 'var(--text-dim)' }}>{c.label}</span>
                {c.detail && <span className="font-mono ml-2" style={{ color: 'var(--text-mute)', fontSize: 10 }}>{c.detail}</span>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {checks.length === 0 && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-mute)' }}>
            <span className="pulse-dot" style={{ width: 6, height: 6, background: 'var(--purple-hi)' }} />
            checking…
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stage: Download ──────────────────────────────────────────────────────────

function DownloadStage({ models, cloudProvider }: { models: ModelItem[]; cloudProvider?: string }) {
  if (cloudProvider) {
    return (
      <div>
        <p className="section-title mb-3">cloud connection</p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-3 rounded p-3 text-xs"
          style={{ background: 'var(--teal-lo)', border: '1px solid rgba(29,184,124,0.25)' }}
        >
          <StatusDot status="ok" />
          <div>
            <span style={{ color: 'var(--teal)' }}>Connected to {cloudProvider}</span>
            <span className="ml-2" style={{ color: 'var(--text-mute)' }}>no local download needed</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div>
      <p className="section-title mb-3">model downloads</p>
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {models.map((m) => (
            <motion.div
              key={m.tag}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <StatusDot status={m.status} />
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{m.name}</span>
                  <span className="font-mono" style={{ color: ROLE_COLOR[m.role] ?? 'var(--text-mute)', fontSize: 9, padding: '0 4px', background: 'var(--surface2)', borderRadius: 2 }}>
                    {m.role}
                  </span>
                </div>
                <span className="font-mono text-xs" style={{ color: 'var(--text-mute)' }}>
                  {m.status === 'exists'   ? '✓ cached' :
                   m.status === 'done'     ? '✓ done' :
                   m.status === 'error'    ? '✗ failed' :
                   m.status === 'pulling'  ? `${(m.progress * 100).toFixed(0)}%` :
                   m.status === 'waiting'  ? 'queued' : ''}
                </span>
              </div>
              {m.status === 'pulling' && (
                <div className="pl-4">
                  <ProgressBar value={m.progress} color="var(--purple)" />
                  {m.total > 0 && (
                    <p className="font-mono mt-0.5" style={{ color: 'var(--text-mute)', fontSize: 9 }}>
                      {fmtBytes(m.completed)} / {fmtBytes(m.total)}
                    </p>
                  )}
                </div>
              )}
              {m.status === 'error' && (
                <p className="pl-4 text-xs" style={{ color: 'var(--red)', fontSize: 10 }}>
                  {m.error ?? 'Unknown error'}
                </p>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {models.length === 0 && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-mute)' }}>
            <span className="pulse-dot" style={{ width: 6, height: 6, background: 'var(--purple-hi)' }} />
            preparing…
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stage: Scan ──────────────────────────────────────────────────────────────

function ScanStage({ result, projectPath }: { result: ScanResult | null; projectPath?: string }) {
  const shortPath = projectPath?.replace(/\\/g, '/').split('/').slice(-2).join('/') ?? '…';

  return (
    <div>
      <p className="section-title mb-3">project scan</p>
      {!result ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-mute)' }}>
          <span className="pulse-dot" style={{ width: 6, height: 6, background: 'var(--purple-hi)' }} />
          scanning {shortPath}…
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          {/* Stats row */}
          <div className="flex gap-4 text-xs font-mono">
            <div>
              <span style={{ color: 'var(--text-mute)' }}>files </span>
              <span style={{ color: 'var(--text)' }}>{result.files}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-mute)' }}>tests </span>
              <span style={{ color: 'var(--teal)' }}>{result.testFiles}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-mute)' }}>lang </span>
              <span style={{ color: 'var(--purple-hi)' }}>{result.primaryLanguage}</span>
            </div>
            {result.framework !== 'unknown' && (
              <div>
                <span style={{ color: 'var(--text-mute)' }}>stack </span>
                <span style={{ color: 'var(--amber)' }}>{result.framework}</span>
              </div>
            )}
          </div>

          {/* Directory tree */}
          {result.topDirs.length > 0 && (
            <div className="rounded p-3 font-mono text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--teal)', marginBottom: 4 }}>
                ~/{shortPath}/
              </div>
              {result.topDirs.map((d, i) => {
                const isLast = i === result.topDirs.length - 1;
                return (
                  <div key={d} style={{ color: 'var(--text-dim)' }}>
                    {isLast ? '└── ' : '├── '}
                    <span style={{ color: 'var(--text-mute)' }}>{d}/</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Language breakdown */}
          {Object.keys(result.languageBreakdown).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(result.languageBreakdown)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([lang, count]) => (
                  <span
                    key={lang}
                    className="font-mono text-xs px-2 py-0.5 rounded"
                    style={{ background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}
                  >
                    {lang} <span style={{ color: 'var(--text-mute)' }}>{count}</span>
                  </span>
                ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ─── Stage: Questions ─────────────────────────────────────────────────────────

function QuestionsStage({
  questions,
  currentIdx,
  onAnswer,
}: {
  questions: QuestionItem[];
  currentIdx: number;
  onAnswer: (id: string, answer: string) => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setValue('');
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [currentIdx]);

  const q = questions[currentIdx];
  if (!q) return null;

  const handleSubmit = () => {
    if (!value.trim()) return;
    onAnswer(q.id, value.trim());
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--teal-lo)', border: '1px solid rgba(29,184,124,0.3)' }}>
          <LynxIcon size={14} />
        </div>
        <p className="text-xs font-mono" style={{ color: 'var(--teal)' }}>lynx · question {currentIdx + 1} of {questions.length}</p>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={q.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
        >
          <p className="text-sm font-medium mb-3" style={{ color: 'var(--text)', lineHeight: 1.5 }}>
            {q.q}
          </p>

          <textarea
            ref={inputRef}
            rows={3}
            className="w-full rounded p-3 text-xs font-mono resize-none"
            placeholder="Type your answer…"
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border-lit)',
              color: 'var(--text)',
              outline: 'none',
            }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--purple)'; }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--border-lit)'; }}
          />

          <div className="flex items-center gap-3 mt-3">
            <button
              className="btn btn-primary text-xs"
              onClick={handleSubmit}
              disabled={!value.trim()}
            >
              {currentIdx < questions.length - 1 ? 'Next →' : 'Launch Lynx →'}
            </button>
            <button
              className="btn btn-ghost text-xs"
              onClick={() => onAnswer(q.id, '')}
            >
              Skip
            </button>
            <span className="ml-auto font-mono text-xs" style={{ color: 'var(--text-mute)' }}>
              ctrl+enter to submit
            </span>
          </div>

          {/* Answered questions above */}
          {currentIdx > 0 && (
            <div className="mt-4 space-y-2">
              {questions.slice(0, currentIdx).map((prev) => (
                <div key={prev.id} className="text-xs" style={{ color: 'var(--text-mute)' }}>
                  <span style={{ color: 'var(--text-dim)' }}>{prev.q}</span>
                  <div className="mt-0.5 pl-2 border-l" style={{ borderColor: 'var(--border-lit)' }}>{prev.a || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function Provisioning({ config, onDone }: ProvisioningProps) {
  const [stage, setStage] = useState<Stage>('check');
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [cloudProvider, setCloudProvider] = useState<string | undefined>();
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>(STATIC_QUESTIONS);
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const executorProvider   = config.executor?.provider   ?? 'ollama';
  const orchestratorProvider = config.orchestrator?.provider ?? 'none';
  const bundleId           = config.executor?.bundleId;
  const projectPath        = config.projectPath ?? '';

  // Run the provision SSE stream on mount
  useEffect(() => {
    let cancelled = false;

    async function runProvision() {
      try {
        const resp = await fetch('/api/setup/provision', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ executorProvider, bundleId, projectPath, orchestratorProvider }),
        });

        if (!resp.body) return;

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          for (const line of text.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (cancelled) break;
              handleEvent(evt);
            } catch { /* skip malformed */ }
          }
        }
      } catch {
        // API not available — fast-forward to questions
        setStage('questions');
      }
    }

    runProvision();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEvent(evt: Record<string, unknown>) {
    switch (evt.type) {
      case 'stage':
        setStage(evt.stage as Stage);
        break;

      case 'check':
        setChecks((prev) => {
          const exists = prev.findIndex((c) => c.key === evt.key);
          const item: CheckItem = {
            key:    String(evt.key),
            status: evt.status as CheckItem['status'],
            label:  String(evt.label ?? ''),
            detail: evt.detail ? String(evt.detail) : undefined,
          };
          if (exists >= 0) {
            const next = [...prev];
            next[exists] = item;
            return next;
          }
          return [...prev, item];
        });
        break;

      case 'cloud_ready':
        setCloudProvider(String(evt.provider ?? orchestratorProvider));
        break;

      case 'model_progress': {
        const m: ModelItem = {
          tag:       String(evt.tag),
          name:      String(evt.name),
          role:      String(evt.role),
          status:    evt.status as ModelItem['status'],
          progress:  Number(evt.progress ?? 0),
          completed: Number(evt.completed ?? 0),
          total:     Number(evt.total ?? 0),
          error:     evt.error ? String(evt.error) : undefined,
        };
        setModels((prev) => {
          const idx = prev.findIndex((x) => x.tag === m.tag);
          if (idx >= 0) { const n = [...prev]; n[idx] = m; return n; }
          return [...prev, m];
        });
        break;
      }

      case 'scan_done': {
        const scan = evt as unknown as ScanResult;
        setScanResult(scan);
        // Pick smart questions based on detected stack
        setQuestions(questionsForProject(scan.framework ?? '', scan.primaryLanguage ?? ''));
        break;
      }

      case 'done':
        setStage('questions');
        break;
    }
  }

  function handleAnswer(id: string, answer: string) {
    const updated = { ...answers, [id]: answer };
    // Update the displayed questions list
    setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, a: answer } : q));
    setAnswers(updated);

    if (qIdx < questions.length - 1) {
      setQIdx((i) => i + 1);
    } else {
      setStage('done');
      // Save answers to config
      const savedConfig = JSON.parse(localStorage.getItem('lynx_config') ?? '{}');
      localStorage.setItem('lynx_config', JSON.stringify({ ...savedConfig, projectAnswers: updated }));
      setTimeout(() => onDone(updated), 600);
    }
  }

  // Stage label for the breadcrumb
  const STAGE_LABELS: Record<Stage, string> = {
    check:     'Environment check',
    download:  'Model setup',
    scan:      'Project scan',
    questions: 'Getting context',
    done:      'Ready',
  };

  const STAGES: Stage[] = ['check', 'download', 'scan', 'questions'];
  const stageIdx = STAGES.indexOf(stage);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--bg)' }}
    >
      <motion.div
        className="w-full max-w-lg rounded-xl p-8"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <LynxIcon size={22} />
            <span className="font-semibold text-sm">Lynx</span>
          </div>
          <span
            className="text-xs font-mono px-2 py-0.5 rounded"
            style={{ background: 'var(--teal-lo)', color: 'var(--teal)', border: '1px solid rgba(29,184,124,0.3)' }}
          >
            {STAGE_LABELS[stage]}
          </span>
        </div>

        {/* Progress track */}
        <div className="mb-6">
          <div className="relative h-0.5 rounded-full overflow-hidden mb-2" style={{ background: 'var(--border-lit)' }}>
            <motion.div
              className="absolute left-0 top-0 h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #3d8b5e, #52a87a)' }}
              animate={{ width: stage === 'done' ? '100%' : `${((stageIdx + 1) / STAGES.length) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <div className="flex items-center justify-between">
            {STAGES.map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div
                  className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                  style={{
                    background: i <= stageIdx ? '#3d8b5e' : 'var(--border-lit)',
                  }}
                />
                <span className="text-xs font-mono hidden sm:block" style={{ color: i <= stageIdx ? 'var(--text-dim)' : 'var(--text-mute)', fontSize: 10 }}>
                  {STAGE_LABELS[s]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Stage content */}
        <AnimatePresence mode="wait">
          {stage === 'check' && (
            <motion.div key="check" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CheckStage checks={checks} />
            </motion.div>
          )}

          {stage === 'download' && (
            <motion.div key="download" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CheckStage checks={checks} />
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                <DownloadStage models={models} cloudProvider={cloudProvider} />
              </div>
            </motion.div>
          )}

          {stage === 'scan' && (
            <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CheckStage checks={checks} />
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                <DownloadStage models={models} cloudProvider={cloudProvider} />
              </div>
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                <ScanStage result={scanResult} projectPath={projectPath} />
              </div>
            </motion.div>
          )}

          {(stage === 'questions' || stage === 'done') && (
            <motion.div key="questions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Summary of completed stages */}
              <div className="rounded p-3 mb-5 text-xs space-y-1.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                {checks.map((c) => (
                  <div key={c.key} className="flex items-center gap-2" style={{ color: 'var(--text-mute)' }}>
                    <StatusDot status={c.status} />
                    <span>{c.label}</span>
                    {c.detail && <span className="font-mono" style={{ fontSize: 9 }}>{c.detail}</span>}
                  </div>
                ))}
                {models.length > 0 && (
                  <div className="flex items-center gap-2" style={{ color: 'var(--text-mute)' }}>
                    <StatusDot status="ok" />
                    <span>{models.filter(m => m.status === 'done' || m.status === 'exists').length}/{models.length} models ready</span>
                  </div>
                )}
                {scanResult && (
                  <div className="flex items-center gap-2" style={{ color: 'var(--text-mute)' }}>
                    <StatusDot status="ok" />
                    <span>{scanResult.files} files · {scanResult.primaryLanguage} · {scanResult.framework}</span>
                  </div>
                )}
              </div>

              {stage === 'done' ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center py-6 text-center"
                >
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: 'var(--teal-lo)' }}>
                    <span style={{ color: 'var(--teal)', fontSize: 20 }}>✓</span>
                  </div>
                  <p className="font-semibold text-sm mb-1">Lynx is ready</p>
                  <p className="text-xs" style={{ color: 'var(--text-mute)' }}>Launching your dashboard…</p>
                </motion.div>
              ) : (
                <QuestionsStage
                  questions={questions}
                  currentIdx={qIdx}
                  onAnswer={handleAnswer}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer — orchestrator + executor labels */}
        <div className="mt-6 pt-4 flex items-center gap-3 text-xs font-mono" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-mute)' }}>
          <span>orchestrator: <span style={{ color: 'var(--amber)' }}>{orchestratorProvider}</span></span>
          <span style={{ color: 'var(--border-lit)' }}>|</span>
          <span>executor: <span style={{ color: 'var(--teal)' }}>{executorProvider}{bundleId ? ` · ${bundleId}` : ''}</span></span>
        </div>
      </motion.div>
    </div>
  );
}

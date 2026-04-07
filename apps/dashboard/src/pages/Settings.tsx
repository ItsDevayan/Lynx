/**
 * Lynx Settings page
 *
 * Sections:
 *   - Current config (read from localStorage)
 *   - Orchestrator — change provider / API key, test connection
 *   - Executor — change bundle, view models
 *   - Project — change path, re-scan
 *   - Danger zone — reset setup, clear session
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FullConfig {
  useCase?: string;
  projectPath?: string;
  projectType?: string;
  orchestrator?: { provider: string; apiKey?: string };
  executor?: { provider: string; bundleId?: string; model?: string };
  notify?: { channel: string };
  projectAnswers?: Record<string, string>;
}

interface MeshStatus {
  active: boolean;
  bundleId: string;
  bundleName: string;
  useCase: string;
  ram: number;
  parallel: boolean;
  models: Record<string, { name?: string; tag?: string; ram?: number } | null>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getConfig(): FullConfig {
  try {
    const s = localStorage.getItem('lynx_config');
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}

function saveConfig(cfg: FullConfig): void {
  localStorage.setItem('lynx_config', JSON.stringify(cfg));
}

const ORCHESTRATOR_OPTIONS = [
  { value: 'groq',        label: 'Groq',           tag: 'FREE',  needsKey: true  },
  { value: 'claude-api',  label: 'Claude API',      tag: 'BEST',  needsKey: true  },
  { value: 'openai',      label: 'OpenAI',          tag: '',      needsKey: true  },
  { value: 'gemini',      label: 'Google Gemini',   tag: '',      needsKey: true  },
  { value: 'claude-cli',  label: 'Claude CLI',      tag: 'LOCAL', needsKey: false },
  { value: 'codex',       label: 'Codex CLI',       tag: 'LOCAL', needsKey: false },
  { value: 'gemini-cli',  label: 'Gemini CLI',      tag: 'LOCAL', needsKey: false },
  { value: 'aider',       label: 'Aider',           tag: 'LOCAL', needsKey: false },
  { value: 'none',        label: 'None / skip',     tag: '',      needsKey: false },
];

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.div
      className="rounded p-5 mb-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <p className="section-title mb-4">{title}</p>
      {children}
    </motion.div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<FullConfig>(getConfig);
  const [verifyState, setVerifyState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [verifyMsg, setVerifyMsg] = useState('');
  const [saved, setSaved] = useState(false);
  const [scanState, setScanState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [scanResult, setScanResult] = useState<Record<string, unknown> | null>(null);
  const [crawlState, setCrawlState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [crawlLog, setCrawlLog] = useState<string[]>([]);
  const [qdrantStatus, setQdrantStatus] = useState<{ available: boolean; points?: number } | null>(null);

  const mesh = useQuery<MeshStatus>({
    queryKey: ['mesh-status-settings'],
    queryFn: () => fetch('/api/mesh/status').then(r => r.json()),
    retry: false,
  });

  const update = (patch: Partial<FullConfig>) => {
    setConfig(c => ({ ...c, ...patch }));
    setSaved(false);
  };

  const updateOrchestrator = (patch: Partial<NonNullable<FullConfig['orchestrator']>>) => {
    setConfig(c => ({ ...c, orchestrator: { ...c.orchestrator, ...patch } as any }));
    setVerifyState('idle');
    setSaved(false);
  };

  const handleSave = async () => {
    saveConfig(config);
    // Persist to backend config file
    try {
      await fetch('/api/setup/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(config),
      });
    } catch { /* offline — localStorage is enough */ }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleVerify = async () => {
    const orch = config.orchestrator;
    if (!orch?.provider) return;
    setVerifyState('loading');
    try {
      const r = await fetch('/api/setup/test-orchestrator', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: orch.provider, apiKey: orch.apiKey }),
      });
      const data = await r.json();
      if (data.ok) {
        setVerifyState('ok');
        setVerifyMsg(data.detail ?? 'Connection verified');
      } else {
        setVerifyState('error');
        setVerifyMsg(data.error ?? 'Verification failed');
      }
    } catch {
      setVerifyState('error');
      setVerifyMsg('Network error');
    }
  };

  const handleScan = async () => {
    if (!config.projectPath) return;
    setScanState('loading');
    try {
      const r = await fetch('/api/setup/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: config.projectPath }),
      });
      const data = await r.json();
      setScanResult(data);
      setScanState('done');
    } catch {
      setScanState('idle');
    }
  };

  const orchOption = ORCHESTRATOR_OPTIONS.find(o => o.value === config.orchestrator?.provider);

  const checkQdrant = async () => {
    try {
      const r = await fetch('/api/crawl/status');
      const d = await r.json();
      setQdrantStatus(d);
    } catch {
      setQdrantStatus({ available: false });
    }
  };

  const handleCrawl = async () => {
    if (!config.projectPath) return;
    setCrawlState('running');
    setCrawlLog([]);
    try {
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectPath: config.projectPath }),
      });
      if (!res.body) { setCrawlState('error'); return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const raw of dec.decode(value).split('\n')) {
          if (!raw.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(raw.slice(6));
            if (ev.type === 'status' || ev.type === 'progress') {
              setCrawlLog(l => [...l.slice(-19), ev.message ?? `indexed ${ev.indexed ?? '?'}/${ev.total ?? '?'} chunks`]);
            }
            if (ev.type === 'done') {
              setCrawlLog(l => [...l, `Done: ${ev.message}`]);
              setCrawlState('done');
              checkQdrant();
            }
            if (ev.type === 'error') {
              setCrawlLog(l => [...l, `Error: ${ev.message}`]);
              setCrawlState('error');
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setCrawlState('error');
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-base font-semibold mb-1">Settings</h1>
      <p className="text-xs mb-6" style={{ color: 'var(--text-dim)' }}>
        Project and AI configuration
      </p>

      {/* ── Orchestrator ── */}
      <Section title="orchestrator">
        <div className="space-y-3">
          {/* Provider select */}
          <div>
            <label className="block text-xs font-mono mb-1.5" style={{ color: 'var(--text-dim)' }}>provider</label>
            <div className="grid grid-cols-3 gap-1.5">
              {ORCHESTRATOR_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => updateOrchestrator({ provider: opt.value })}
                  className="text-left px-3 py-2 rounded text-xs transition-all"
                  style={{
                    background: config.orchestrator?.provider === opt.value ? 'var(--overlay)' : 'var(--bg)',
                    border: `1px solid ${config.orchestrator?.provider === opt.value ? 'var(--purple)' : 'var(--border)'}`,
                    color: config.orchestrator?.provider === opt.value ? 'var(--text)' : 'var(--text-dim)',
                  }}
                >
                  <span>{opt.label}</span>
                  {opt.tag && (
                    <span
                      className="ml-1 font-mono rounded px-1"
                      style={{ fontSize: 9, background: 'var(--surface2)', color: 'var(--teal)' }}
                    >
                      {opt.tag}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* API key input */}
          {orchOption?.needsKey && (
            <div>
              <label className="block text-xs font-mono mb-1.5" style={{ color: 'var(--text-dim)' }}>api key</label>
              <input
                type="password"
                className="w-full rounded px-3 py-2 text-xs font-mono outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                placeholder="sk-..."
                value={config.orchestrator?.apiKey ?? ''}
                onChange={e => updateOrchestrator({ apiKey: e.target.value })}
              />
            </div>
          )}

          {/* Verify button */}
          <div className="flex items-center gap-3">
            <button
              className="btn btn-ghost text-xs"
              onClick={handleVerify}
              disabled={verifyState === 'loading'}
            >
              {verifyState === 'loading' ? '…' : '⚡ Test connection'}
            </button>
            {verifyState === 'ok' && (
              <span className="text-xs font-mono" style={{ color: 'var(--teal)' }}>✓ {verifyMsg}</span>
            )}
            {verifyState === 'error' && (
              <span className="text-xs font-mono" style={{ color: 'var(--red)' }}>✗ {verifyMsg}</span>
            )}
          </div>
        </div>
      </Section>

      {/* ── Executor mesh ── */}
      <Section title="executor mesh">
        {mesh.data ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded px-3 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <p className="font-mono mb-0.5" style={{ color: 'var(--text-mute)', fontSize: 10 }}>BUNDLE</p>
                <p style={{ color: 'var(--teal)' }}>{mesh.data.bundleName}</p>
              </div>
              <div className="rounded px-3 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <p className="font-mono mb-0.5" style={{ color: 'var(--text-mute)', fontSize: 10 }}>RAM</p>
                <p style={{ color: 'var(--text)' }}>{mesh.data.ram}GB available</p>
              </div>
              <div className="rounded px-3 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <p className="font-mono mb-0.5" style={{ color: 'var(--text-mute)', fontSize: 10 }}>MODE</p>
                <p style={{ color: mesh.data.parallel ? 'var(--teal)' : 'var(--text-dim)' }}>
                  {mesh.data.parallel ? '∥ parallel' : '→ serial'}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              {Object.entries(mesh.data.models).filter(([, v]) => v).map(([role, spec]) => (
                <div key={role} className="flex items-center gap-2 text-xs py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span className="font-mono w-24 flex-shrink-0" style={{ color: 'var(--text-mute)', fontSize: 10 }}>{role}</span>
                  <span style={{ color: 'var(--text-dim)' }}>{spec?.name ?? spec?.tag}</span>
                  {spec?.ram && (
                    <span className="ml-auto font-mono" style={{ color: 'var(--text-mute)', fontSize: 10 }}>{spec.ram}GB</span>
                  )}
                </div>
              ))}
            </div>

            <button
              className="btn btn-ghost text-xs"
              onClick={() => fetch('/api/mesh/unload', { method: 'POST' })}
            >
              ⊘ Unload models from RAM
            </button>
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-mute)' }}>
            Mesh not initialized yet. Send a message in Brain to activate.
          </p>
        )}
      </Section>

      {/* ── Project ── */}
      <Section title="project">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-mono mb-1.5" style={{ color: 'var(--text-dim)' }}>project path</label>
            <input
              type="text"
              className="w-full rounded px-3 py-2 text-xs font-mono outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              placeholder="/path/to/your/project"
              value={config.projectPath ?? ''}
              onChange={e => update({ projectPath: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              className="btn btn-ghost text-xs"
              onClick={handleScan}
              disabled={!config.projectPath || scanState === 'loading'}
            >
              {scanState === 'loading' ? '…scanning' : '◎ Re-scan project'}
            </button>
          </div>

          {scanState === 'done' && scanResult && (
            <div className="rounded p-3 text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['files', String(scanResult.files ?? '—')],
                  ['language', String(scanResult.primaryLanguage ?? '—')],
                  ['framework', String(scanResult.framework ?? '—')],
                  ['test files', String(scanResult.testFiles ?? '—')],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="font-mono" style={{ color: 'var(--text-mute)', minWidth: 72 }}>{k}</span>
                    <span style={{ color: 'var(--text)' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {config.projectAnswers && Object.keys(config.projectAnswers).length > 0 && (
            <div>
              <p className="text-xs font-mono mb-2" style={{ color: 'var(--text-mute)' }}>project context (from provisioning)</p>
              <div className="space-y-1">
                {Object.entries(config.projectAnswers).map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-xs">
                    <span className="font-mono flex-shrink-0" style={{ color: 'var(--text-mute)', minWidth: 120 }}>{k}</span>
                    <span style={{ color: 'var(--text-dim)' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Save button */}
      <div className="flex items-center gap-3 mb-6">
        <button className="btn btn-primary text-xs" onClick={handleSave}>
          {saved ? '✓ Saved' : 'Save changes'}
        </button>
        {saved && (
          <span className="text-xs font-mono" style={{ color: 'var(--teal)' }}>
            Config written to localStorage + backend
          </span>
        )}
      </div>

      {/* ── RAG / Qdrant ── */}
      <Section title="rag indexing (qdrant)">
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            Index your codebase into Qdrant for semantic search in Brain.
            Requires <span className="font-mono" style={{ color: 'var(--purple)' }}>qdrant</span> running on <span className="font-mono" style={{ color: 'var(--text-dim)' }}>:6333</span> and{' '}
            <span className="font-mono" style={{ color: 'var(--purple)' }}>nomic-embed-text</span> in Ollama.
          </p>

          <div className="flex items-center gap-2">
            <button className="btn btn-ghost text-xs" onClick={checkQdrant}>
              ◎ Check Qdrant
            </button>
            {qdrantStatus !== null && (
              <span className="text-xs font-mono" style={{ color: qdrantStatus.available ? 'var(--teal)' : 'var(--red)' }}>
                {qdrantStatus.available
                  ? `✓ connected · ${qdrantStatus.points ?? 0} vectors`
                  : '✗ not reachable'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn btn-ghost text-xs"
              onClick={handleCrawl}
              disabled={!config.projectPath || crawlState === 'running'}
            >
              {crawlState === 'running' ? '… indexing' : '⬆ Index project'}
            </button>
            <span className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>
              {config.projectPath ? config.projectPath.split(/[/\\]/).pop() : 'set project path first'}
            </span>
          </div>

          {crawlLog.length > 0 && (
            <pre
              className="text-xs p-2 rounded overflow-auto"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: crawlState === 'error' ? 'var(--red)' : crawlState === 'done' ? 'var(--teal)' : 'var(--text-dim)',
                maxHeight: 120,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {crawlLog.join('\n')}
            </pre>
          )}
        </div>
      </Section>

      {/* ── Danger zone ── */}
      <Section title="danger zone">
        <div className="space-y-2">
          <p className="text-xs mb-3" style={{ color: 'var(--text-mute)' }}>
            These actions cannot be undone.
          </p>
          <button
            className="btn btn-ghost text-xs w-full text-left"
            style={{ color: 'var(--amber)', borderColor: 'var(--amber)40' }}
            onClick={() => {
              sessionStorage.removeItem('lynx_brain_session');
              navigate('/brain');
            }}
          >
            ◌ Clear Brain session memory
          </button>
          <button
            className="btn btn-ghost text-xs w-full text-left"
            style={{ color: 'var(--red)', borderColor: 'var(--red)40' }}
            onClick={() => {
              localStorage.removeItem('lynx_setup_complete');
              localStorage.removeItem('lynx_config');
              window.location.reload();
            }}
          >
            ← Re-run setup wizard (resets everything)
          </button>
        </div>
      </Section>

      {/* Raw JSON */}
      <details className="mt-2">
        <summary className="text-xs font-mono cursor-pointer" style={{ color: 'var(--text-mute)' }}>
          raw config json
        </summary>
        <pre
          className="text-xs mt-2 p-3 rounded overflow-auto"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-dim)', maxHeight: 300 }}
        >
          {JSON.stringify(config, null, 2)}
        </pre>
      </details>
    </div>
  );
}

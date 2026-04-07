import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Navigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

interface LynxConfig {
  projectPath?: string;
  llm?: { mode: string };
  orchestrator?: { provider: string; model?: string };
  executor?: { provider: string; bundleId?: string };
  projectAnswers?: Record<string, string>;
}

interface MeshStatus {
  active: boolean;
  bundleId: string;
  bundleName: string;
  useCase: string;
  ram: number;
  parallel: boolean;
  ollamaUrl: string;
  models: Record<string, { name?: string; tag?: string; ram?: number } | null>;
}

function getConfig(): LynxConfig | null {
  try {
    const s = localStorage.getItem('lynx_config');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

// ─── No project connected ─────────────────────────────────────────────────────

function NoProject() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-96 text-center px-8">
      <div
        className="w-16 h-16 rounded-xl flex items-center justify-center mb-6 font-mono text-2xl"
        style={{ background: 'var(--surface2)', border: '1px solid var(--border-lit)', color: 'var(--text-dim)' }}
      >
        ○
      </div>
      <h2 className="text-lg font-semibold mb-2">No project connected</h2>
      <p className="text-sm mb-6 max-w-sm" style={{ color: 'var(--text-dim)' }}>
        Lynx needs access to a codebase before it can monitor errors, run tests, or scan for vulnerabilities.
      </p>
      <div className="flex gap-3">
        <button
          className="btn btn-primary"
          onClick={() => {
            localStorage.removeItem('lynx_setup_complete');
            localStorage.removeItem('lynx_config');
            window.location.reload();
          }}
        >
          ← Run setup wizard
        </button>
        <button className="btn btn-ghost" onClick={() => navigate('/settings')}>
          Manual config
        </button>
      </div>

      {/* What you'll get */}
      <div
        className="mt-10 rounded p-5 text-left max-w-sm w-full"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <p className="text-xs font-mono mb-3" style={{ color: 'var(--text-dim)' }}>WHAT LYNX WILL DO AFTER CONNECTING</p>
        {[
          ['⚗', 'Auto-detect test framework and run tests'],
          ['🛡', 'SAST scan with Semgrep + CVE check with Trivy'],
          ['◎', 'Start capturing errors from POST /api/ingest'],
          ['◈', 'Index your codebase for AI context (RAG)'],
          ['◉', 'Track competitors based on your project type'],
        ].map(([icon, text]) => (
          <div key={text} className="flex items-start gap-2.5 mb-2.5 text-xs" style={{ color: 'var(--text-dim)' }}>
            <span className="flex-shrink-0 mt-0.5">{icon}</span>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Connected project ────────────────────────────────────────────────────────

interface HealthData {
  status: string;
  checks: Record<string, string>;
  uptime: number;
}

interface Counts { DEBUG?: number; INFO?: number; WARN?: number; ERROR?: number; FATAL?: number; }

interface Tracker {
  fingerprint: string;
  errorName: string;
  severity: string;
  sampleMessage: string;
  occurrences: number;
  lastOccurrence: string;
  layer: string;
}

interface GitStatus {
  branch: string;
  clean: boolean;
  summary: { staged: number; unstaged: number; untracked: number };
}

const SEV_COLOR: Record<string, string> = {
  DEBUG: 'var(--text-mute)',
  INFO:  'var(--purple)',
  WARN:  'var(--amber)',
  ERROR: 'var(--red)',
  FATAL: '#ff3333',
};

function ConnectedDashboard({ config }: { config: LynxConfig }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const projectName = config.projectPath?.split('/').filter(Boolean).pop() ?? 'project';
  const [scanning, setScanning] = useState(false);

  const health    = useQuery<HealthData>({ queryKey: ['health'],   queryFn: () => fetch('/api/health').then(r => r.json()),              refetchInterval: 30_000 });
  const counts    = useQuery<Counts>    ({ queryKey: ['counts'],   queryFn: () => fetch('/api/monitor/counts').then(r => r.json()),      refetchInterval: 15_000 });
  const trackers  = useQuery<{ trackers: Tracker[] }>({ queryKey: ['trackers-overview'], queryFn: () => fetch('/api/monitor/trackers?resolved=false&limit=4').then(r => r.json()), refetchInterval: 20_000 });
  const hitl      = useQuery<{ count: number }>({ queryKey: ['hitl-count'], queryFn: () => fetch('/api/hitl').then(r => r.json()).then(d => ({ count: d.count ?? 0 })), refetchInterval: 30_000 });
  const gitStatus = useQuery<GitStatus>({ queryKey: ['git-status'], queryFn: () => fetch(`/api/git/status?projectPath=${encodeURIComponent(config.projectPath ?? '')}`).then(r => r.ok ? r.json() : null), refetchInterval: 30_000, retry: false });

  // Instant re-fetch when error:new arrives over WS
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (msg?.type === 'error:new') {
        qc.invalidateQueries({ queryKey: ['counts'] });
        qc.invalidateQueries({ queryKey: ['trackers-overview'] });
      }
      if (msg?.type === 'hitl:created') {
        qc.invalidateQueries({ queryKey: ['hitl-count'] });
      }
    };
    window.addEventListener('lynx:ws', handler);
    return () => window.removeEventListener('lynx:ws', handler);
  }, [qc]);

  const handleScanNow = async () => {
    if (!config.projectPath) return;
    setScanning(true);
    try {
      await fetch('/api/security/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectPath: config.projectPath, sast: false }),
      });
      navigate('/security');
    } catch { /* ignore */ }
    setScanning(false);
  };

  const c = counts.data ?? {};
  const errors = (c.ERROR ?? 0) + (c.FATAL ?? 0);
  const warns  = c.WARN ?? 0;
  const isOk   = health.data?.status === 'ok';
  const pendingApprovals = (hitl.data as any)?.count ?? 0;
  const recentTrackers = trackers.data?.trackers ?? [];
  const git = gitStatus.data;

  const SEV_DOT: Record<string, string> = {
    DEBUG: 'var(--text-mute)', INFO: 'var(--purple-hi)',
    WARN: 'var(--amber)', ERROR: 'var(--red)', FATAL: '#ff3333',
  };

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>~/</span>
            <h1 className="text-base font-semibold">{projectName}</h1>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="pulse-dot"
              style={{ background: isOk ? 'var(--teal)' : 'var(--red)' }}
            />
            <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
              {isOk ? 'healthy' : 'degraded'} · up {Math.floor((health.data?.uptime ?? 0) / 3600)}h
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Git branch indicator */}
          {git && (
            <span
              className="font-mono text-xs px-2 py-0.5 rounded flex items-center gap-1.5"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}
            >
              <span style={{ color: 'var(--purple-hi)' }}>⎇</span>
              {git.branch}
              {!git.clean && (
                <span style={{ color: 'var(--amber)' }}>
                  {git.summary.staged > 0 ? `+${git.summary.staged}` : ''}{git.summary.unstaged > 0 ? ` ~${git.summary.unstaged}` : ''}
                </span>
              )}
            </span>
          )}
          <button
            className="btn btn-ghost text-xs"
            onClick={handleScanNow}
            disabled={scanning}
          >
            {scanning ? '…' : '⟳ Scan now'}
          </button>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'errors',   value: errors, color: errors > 0 ? 'var(--red)' : 'var(--teal)',   unit: 'active' },
          { label: 'warnings', value: warns,  color: warns > 3  ? 'var(--amber)' : 'var(--text-dim)', unit: 'open' },
          { label: 'uptime',   value: isOk ? '100%' : '—', color: isOk ? 'var(--teal)' : 'var(--red)', unit: 'api' },
          { label: 'pg',       value: health.data?.checks?.postgres === 'ok' ? 'ok' : 'err', color: health.data?.checks?.postgres === 'ok' ? 'var(--teal)' : 'var(--red)', unit: 'postgres' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="rounded p-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p className="text-xs font-mono mb-1" style={{ color: 'var(--text-mute)' }}>{s.unit}</p>
            <p className="text-2xl font-mono font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-dim)' }}>{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Event breakdown */}
      <motion.div
        className="rounded p-4 mb-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <p className="section-title mb-3">event distribution</p>
        <div className="flex gap-2 flex-wrap">
          {(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'] as const).map((sev) => (
            <div
              key={sev}
              className="flex items-center gap-2 px-3 py-1.5 rounded font-mono text-xs"
              style={{ background: 'var(--surface2)', border: `1px solid var(--border)` }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: SEV_COLOR[sev] }} />
              <span style={{ color: SEV_COLOR[sev] }}>{sev}</span>
              <span style={{ color: 'var(--text)' }}>{c[sev] ?? 0}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Bottom row: recent errors + pending approvals */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Recent errors */}
        <motion.div
          className="rounded p-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">recent errors</p>
            <button
              className="text-xs font-mono"
              style={{ color: 'var(--text-mute)', textDecoration: 'underline dotted' }}
              onClick={() => navigate('/monitor')}
            >
              view all
            </button>
          </div>
          {recentTrackers.length === 0 ? (
            <p className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>No open errors</p>
          ) : (
            <div className="space-y-2">
              {recentTrackers.slice(0, 4).map(t => (
                <div key={t.fingerprint} className="flex items-start gap-2 text-xs">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1"
                    style={{ background: SEV_DOT[t.severity] ?? 'var(--red)' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono truncate" style={{ color: 'var(--text)' }}>{t.errorName}</p>
                    <p className="font-mono truncate" style={{ color: 'var(--text-mute)', fontSize: 10 }}>
                      ×{t.occurrences} · {formatDistanceToNow(new Date(t.lastOccurrence), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Pending approvals */}
        <motion.div
          className="rounded p-4"
          style={{ background: 'var(--surface)', border: `1px solid ${pendingApprovals > 0 ? 'rgba(212,160,23,0.3)' : 'var(--border)'}` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">approvals</p>
            {pendingApprovals > 0 && (
              <button
                className="text-xs font-mono"
                style={{ color: 'var(--amber)', textDecoration: 'underline dotted' }}
                onClick={() => navigate('/approvals')}
              >
                review
              </button>
            )}
          </div>
          {pendingApprovals === 0 ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs" style={{ color: 'var(--teal)' }}>✓</span>
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>All clear</span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span
                className="font-mono text-3xl font-bold"
                style={{ color: 'var(--amber)' }}
              >
                {pendingApprovals}
              </span>
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--amber)' }}>
                  pending {pendingApprovals === 1 ? 'approval' : 'approvals'}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  Brain proposed code changes awaiting your review
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* AI Engine — two-tier system */}
      <AIEnginePanel config={config} />
    </div>
  );
}

// ─── AI Engine panel ──────────────────────────────────────────────────────────

function AIEnginePanel({ config }: { config: LynxConfig }) {
  const mesh = useQuery<MeshStatus>({
    queryKey: ['mesh-status'],
    queryFn: () => fetch('/api/mesh/status').then(r => r.json()),
    refetchInterval: 60_000,
  });

  const orchestratorProvider = config.orchestrator?.provider ?? config.llm?.mode ?? 'none';
  const isOrchestratorCloud  = ['groq', 'claude-api', 'claude-cli', 'openai', 'gemini'].includes(orchestratorProvider);
  const m = mesh.data;

  const MODEL_ROLES = ['general', 'coder', 'reasoner', 'autocomplete'] as const;

  return (
    <motion.div
      className="rounded p-4 mt-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
    >
      <p className="section-title mb-3">ai engine</p>

      {/* Two-tier diagram row */}
      <div className="flex items-stretch gap-3 mb-4">
        {/* Orchestrator tier */}
        <div
          className="flex-1 rounded p-3"
          style={{ background: 'var(--bg)', border: `1px solid ${isOrchestratorCloud ? 'var(--purple)40' : 'var(--border)'}` }}
        >
          <p className="font-mono text-xs mb-1" style={{ color: 'var(--text-mute)' }}>ORCHESTRATOR</p>
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: isOrchestratorCloud ? 'var(--purple-hi)' : 'var(--text-mute)' }}
            />
            <span className="text-xs font-semibold capitalize" style={{ color: isOrchestratorCloud ? 'var(--purple-hi)' : 'var(--text-dim)' }}>
              {orchestratorProvider === 'none' ? 'not configured' : orchestratorProvider}
            </span>
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-mute)' }}>
            {orchestratorProvider === 'groq'      && 'llama-3.3-70b-versatile'}
            {orchestratorProvider === 'claude-api' && 'claude-sonnet-4-6'}
            {orchestratorProvider === 'claude-cli' && 'claude cli'}
            {orchestratorProvider === 'openai'    && 'gpt-4o'}
            {orchestratorProvider === 'gemini'    && 'gemini-pro'}
            {orchestratorProvider === 'none'      && 'routes tasks, plans, decides'}
          </p>
          <p className="text-xs mt-1.5 italic" style={{ color: 'var(--text-mute)', opacity: 0.6 }}>
            plans · decides · synthesizes
          </p>
        </div>

        {/* Arrow */}
        <div className="flex items-center justify-center flex-shrink-0 px-1">
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-mono text-xs" style={{ color: 'var(--text-mute)' }}>routes</span>
            <span className="font-mono" style={{ color: 'var(--text-mute)' }}>↓</span>
          </div>
        </div>

        {/* Executor tier */}
        <div
          className="flex-1 rounded p-3"
          style={{ background: 'var(--bg)', border: `1px solid ${m?.active ? 'rgba(29,184,124,0.3)' : 'var(--border)'}` }}
        >
          <p className="font-mono text-xs mb-1" style={{ color: 'var(--text-mute)' }}>EXECUTOR MESH</p>
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: m?.active ? 'var(--teal)' : 'var(--text-mute)' }}
            />
            <span className="text-xs font-semibold" style={{ color: m?.active ? 'var(--teal)' : 'var(--text-dim)' }}>
              {m ? m.bundleName : (config.executor?.provider ?? 'ollama')}
            </span>
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-mute)' }}>
            {m ? `${m.ram}GB RAM · ${m.parallel ? 'parallel' : 'serial'} · ${m.useCase}` : 'local · private · free'}
          </p>
          <p className="text-xs mt-1.5 italic" style={{ color: 'var(--text-mute)', opacity: 0.6 }}>
            executes · codes · generates
          </p>
        </div>
      </div>

      {/* Specialist model grid */}
      {m?.models && (
        <div className="grid grid-cols-2 gap-2">
          {MODEL_ROLES.map((role) => {
            const spec = m.models[role];
            if (!spec) return null;
            return (
              <div
                key={role}
                className="rounded px-3 py-2 flex items-center gap-2"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
              >
                <span className="font-mono text-xs flex-shrink-0" style={{ color: 'var(--text-mute)', minWidth: 80 }}>
                  {role}
                </span>
                <span className="text-xs truncate" style={{ color: 'var(--text-dim)' }}>
                  {spec.name ?? spec.tag ?? '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!m && !mesh.isLoading && (
        <p className="text-xs" style={{ color: 'var(--text-mute)' }}>
          Mesh not initialized yet — send a message in Brain to activate
        </p>
      )}
    </motion.div>
  );
}

export function OverviewPage() {
  const config = getConfig();
  const hasProject = !!(config?.projectPath);

  if (!hasProject) return <Navigate to="/landing" replace />;
  return <ConnectedDashboard config={config!} />;
}

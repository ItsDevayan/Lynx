import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

interface LynxConfig {
  projectPath?: string;
  llm?: { mode: string };
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

const SEV_COLOR: Record<string, string> = {
  DEBUG: 'var(--text-mute)',
  INFO:  'var(--purple)',
  WARN:  'var(--amber)',
  ERROR: 'var(--red)',
  FATAL: '#ff3333',
};

function ConnectedDashboard({ config }: { config: LynxConfig }) {
  const projectName = config.projectPath?.split('/').filter(Boolean).pop() ?? 'project';

  const health  = useQuery<HealthData>({ queryKey: ['health'],  queryFn: () => fetch('/api/health').then(r => r.json()),        refetchInterval: 30_000 });
  const counts  = useQuery<Counts>     ({ queryKey: ['counts'],  queryFn: () => fetch('/api/monitor/counts').then(r => r.json()), refetchInterval: 15_000 });

  const c = counts.data ?? {};
  const errors = (c.ERROR ?? 0) + (c.FATAL ?? 0);
  const warns  = c.WARN ?? 0;
  const isOk   = health.data?.status === 'ok';

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
          <button className="btn btn-ghost text-xs">⟳ Scan now</button>
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

      {/* LLM status */}
      <motion.div
        className="rounded p-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <p className="section-title mb-3">ai configuration</p>
        <div className="flex items-center gap-3 text-xs">
          <span
            className="badge"
            style={{
              background: config.llm?.mode !== 'skip' ? 'var(--teal-lo)' : 'var(--surface2)',
              color: config.llm?.mode !== 'skip' ? 'var(--teal)' : 'var(--text-dim)',
              border: `1px solid ${config.llm?.mode !== 'skip' ? 'rgba(29,184,124,0.3)' : 'var(--border)'}`,
            }}
          >
            {config.llm?.mode ?? 'not configured'}
          </span>
          {config.llm?.mode === 'skip' && (
            <span style={{ color: 'var(--text-mute)' }}>
              Brain features disabled. Configure in settings →
            </span>
          )}
          {config.llm?.mode === 'groq' && (
            <span style={{ color: 'var(--text-dim)' }}>llama-3.3-70b-versatile</span>
          )}
          {config.llm?.mode === 'ollama' && (
            <span style={{ color: 'var(--text-dim)' }}>running locally</span>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function OverviewPage() {
  const config = getConfig();
  const hasProject = !!(config?.projectPath);

  if (!hasProject) return <NoProject />;
  return <ConnectedDashboard config={config!} />;
}

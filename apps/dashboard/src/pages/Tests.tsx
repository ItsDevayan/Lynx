/**
 * Lynx Tests page
 *
 * Shows detected test files from the project scan.
 * Allows triggering a test run via POST /api/tests/run (SSE).
 * Falls back gracefully if test runner is not yet wired.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanResult {
  files: number;
  testFiles: number;
  primaryLanguage: string;
  framework: string;
  topDirs: string[];
  entryPoints: string[];
  packageName?: string;
  testFramework?: string;
  testFilePaths?: string[];
}

interface FullConfig {
  projectPath?: string;
  orchestrator?: { provider: string };
  executor?: { provider: string };
}

function getConfig(): FullConfig | null {
  try {
    const s = localStorage.getItem('lynx_config');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

// ─── Test framework detection ─────────────────────────────────────────────────

const FRAMEWORK_INFO: Record<string, { icon: string; cmd: string; color: string }> = {
  jest:    { icon: '⚗', cmd: 'npx jest --passWithNoTests', color: 'var(--amber)' },
  vitest:  { icon: '⚗', cmd: 'npx vitest run',             color: 'var(--teal)' },
  pytest:  { icon: '⚗', cmd: 'pytest -v',                  color: 'var(--purple-hi)' },
  mocha:   { icon: '⚗', cmd: 'npx mocha',                  color: 'var(--amber)' },
  go:      { icon: '⚗', cmd: 'go test ./...',              color: 'var(--teal)' },
  cargo:   { icon: '⚗', cmd: 'cargo test',                 color: 'var(--red)' },
  unknown: { icon: '⚗', cmd: '',                            color: 'var(--text-dim)' },
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export function TestsPage() {
  const config = getConfig();
  const navigate = useNavigate();
  const [runLog, setRunLog] = useState<string[]>([]);
  const [runState, setRunState] = useState<'idle' | 'running' | 'pass' | 'fail'>('idle');

  const scan = useQuery<ScanResult>({
    queryKey: ['project-scan', config?.projectPath],
    queryFn: async () => {
      if (!config?.projectPath) throw new Error('No project path');
      const r = await fetch('/api/setup/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: config.projectPath }),
      });
      if (!r.ok) throw new Error('Scan failed');
      return r.json();
    },
    enabled: !!config?.projectPath,
    staleTime: 60_000,
  });

  const framework = (scan.data?.testFramework ?? scan.data?.framework ?? 'unknown').toLowerCase();
  const fwInfo = FRAMEWORK_INFO[framework] ?? FRAMEWORK_INFO.unknown;
  const testCount = scan.data?.testFiles ?? 0;

  const handleRun = async () => {
    if (runState === 'running') return;
    setRunState('running');
    setRunLog(['Running tests…']);

    try {
      const r = await fetch('/api/tests/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectPath: config?.projectPath,
          framework,
          cmd: fwInfo.cmd,
        }),
      });

      if (!r.ok || !r.body) {
        // API not yet wired — show helpful message
        setRunLog([
          `$ ${fwInfo.cmd || 'test runner'}`,
          '',
          '⚠  Test runner API not yet available in this build.',
          `Run manually: cd ${config?.projectPath} && ${fwInfo.cmd || '<test command>'}`,
        ]);
        setRunState('idle');
        return;
      }

      // Stream SSE output
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      const lines: string[] = [`$ ${fwInfo.cmd}`];
      setRunLog([...lines]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const raw of text.split('\n')) {
          if (raw.startsWith('data: ')) {
            try {
              const ev = JSON.parse(raw.slice(6));
              if (ev.type === 'line') { lines.push(ev.text); setRunLog([...lines]); }
              if (ev.type === 'done') {
                setRunState(ev.pass ? 'pass' : 'fail');
                lines.push('', ev.pass ? '✓ All tests passed.' : '✗ Some tests failed.');
                setRunLog([...lines]);
              }
            } catch { /* ignore malformed */ }
          }
        }
      }
    } catch {
      setRunLog(['Connection error. Is the API running on :4000?']);
      setRunState('idle');
    }
  };

  if (!config?.projectPath) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full">
        <p className="text-sm font-semibold mb-2">No project connected</p>
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          Complete setup to enable test detection.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-base font-semibold">tests</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
            auto-detect · run · analyze failures
          </p>
        </div>
        <div className="flex items-center gap-2">
          {scan.data && (
            <span
              className="badge font-mono text-xs"
              style={{ background: 'var(--surface2)', color: fwInfo.color, border: `1px solid ${fwInfo.color}40` }}
            >
              {fwInfo.icon} {framework}
            </span>
          )}
          <button
            className="btn btn-primary text-xs"
            onClick={handleRun}
            disabled={runState === 'running' || !scan.data}
          >
            {runState === 'running' ? '…running' : '▶ Run tests'}
          </button>
        </div>
      </div>

      {/* Stats row */}
      {scan.isLoading && (
        <p className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>scanning project…</p>
      )}

      {scan.data && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'test files', value: testCount,                     color: testCount > 0 ? 'var(--teal)' : 'var(--text-dim)' },
            { label: 'framework',  value: framework,                      color: fwInfo.color },
            { label: 'language',   value: scan.data.primaryLanguage,      color: 'var(--text)' },
            { label: 'total files',value: scan.data.files,                color: 'var(--text-dim)' },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded p-3"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <p className="text-xs font-mono mb-1" style={{ color: 'var(--text-mute)' }}>{s.label}</p>
              <p className="text-lg font-mono font-bold truncate" style={{ color: s.color }}>{s.value}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Run command hint */}
      {scan.data && fwInfo.cmd && (
        <div
          className="rounded px-4 py-3 mb-5 flex items-center gap-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <span className="font-mono text-xs" style={{ color: 'var(--text-mute)' }}>$</span>
          <code className="text-xs font-mono flex-1" style={{ color: 'var(--text-dim)' }}>
            {fwInfo.cmd}
          </code>
          <button
            className="btn btn-ghost text-xs"
            onClick={() => navigator.clipboard?.writeText(`cd ${config.projectPath} && ${fwInfo.cmd}`)}
          >
            copy
          </button>
        </div>
      )}

      {/* Run output */}
      <AnimatePresence>
        {runLog.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded overflow-hidden mb-5"
            style={{ border: `1px solid ${runState === 'pass' ? 'rgba(29,184,124,0.3)' : runState === 'fail' ? 'rgba(224,85,85,0.3)' : 'var(--border)'}` }}
          >
            <div
              className="px-3 py-2 flex items-center justify-between"
              style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}
            >
              <span className="font-mono text-xs" style={{ color: 'var(--text-mute)' }}>output</span>
              {runState === 'pass' && <span className="text-xs font-mono" style={{ color: 'var(--teal)' }}>✓ passed</span>}
              {runState === 'fail' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono" style={{ color: 'var(--red)' }}>✗ failed</span>
                  <button
                    onClick={() => {
                      const failureLines = runLog.filter(l => l.includes('FAIL') || l.includes('✗') || l.includes('Error') || l.includes('AssertionError')).slice(0, 10).join('\n');
                      localStorage.setItem('lynx_brain_prefill', `Fix these failing ${framework} tests:\n\n\`\`\`\n${failureLines || runLog.slice(-15).join('\n')}\n\`\`\`\n\nProject: ${config?.projectPath ?? ''}`);
                      navigate('/brain');
                    }}
                    className="text-xs font-mono px-2 py-0.5 rounded transition-all"
                    style={{ background: 'var(--surface)', color: 'var(--purple-hi)', border: '1px solid rgba(124,111,205,0.3)' }}
                  >
                    → fix in Brain
                  </button>
                </div>
              )}
              {runState === 'running' && (
                <span className="text-xs font-mono animate-pulse" style={{ color: 'var(--amber)' }}>running…</span>
              )}
            </div>
            <pre
              className="text-xs p-4 overflow-auto max-h-80 leading-relaxed"
              style={{ background: 'var(--bg)', color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}
            >
              {runLog.join('\n')}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Test files list */}
      {scan.data?.testFilePaths && scan.data.testFilePaths.length > 0 && (
        <motion.div
          className="rounded p-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <p className="section-title mb-3">test files</p>
          <div className="space-y-1 max-h-64 overflow-auto">
            {scan.data.testFilePaths.slice(0, 50).map((f) => (
              <div key={f} className="flex items-center gap-2 text-xs py-1">
                <span className="font-mono" style={{ color: fwInfo.color, fontSize: 10 }}>◈</span>
                <span className="font-mono truncate" style={{ color: 'var(--text-dim)' }}>{f}</span>
              </div>
            ))}
            {scan.data.testFilePaths.length > 50 && (
              <p className="text-xs font-mono mt-2" style={{ color: 'var(--text-mute)' }}>
                +{scan.data.testFilePaths.length - 50} more files
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* No tests found */}
      {scan.data && testCount === 0 && (
        <div
          className="rounded p-6 text-center"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-sm font-semibold mb-2">No test files detected</p>
          <p className="text-xs mb-4" style={{ color: 'var(--text-dim)' }}>
            Lynx scanned {scan.data.files} files and found no test files matching known patterns.
          </p>
          <p className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>
            Ask Brain: "Write tests for this project" to generate a test suite
          </p>
        </div>
      )}
    </div>
  );
}

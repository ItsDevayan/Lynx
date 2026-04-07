/**
 * Lynx Security page
 *
 * Shows:
 *  - Dependency CVE scan (via POST /api/security/scan-deps)
 *  - SAST findings (via POST /api/security/sast)
 *  - Actionable summary from the executor LLM
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FullConfig { projectPath?: string; }

interface CVEFinding {
  packageName: string;
  installedVersion: string;
  fixedVersion?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  cveId: string;
  title: string;
  url?: string;
}

interface SASTFinding {
  ruleId: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  file: string;
  line: number;
  col?: number;
}

interface ScanResult {
  cves: CVEFinding[];
  sast: SASTFinding[];
  scannedAt: string;
  summary?: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getConfig(): FullConfig | null {
  try {
    const s = localStorage.getItem('lynx_config');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: '#ff3333',
  HIGH:     'var(--red)',
  MEDIUM:   'var(--amber)',
  LOW:      'var(--text-dim)',
  UNKNOWN:  'var(--text-mute)',
  ERROR:    'var(--red)',
  WARNING:  'var(--amber)',
  INFO:     'var(--purple-hi)',
};

const SEV_BG: Record<string, string> = {
  CRITICAL: 'rgba(255,51,51,0.12)',
  HIGH:     'var(--red-lo)',
  MEDIUM:   'var(--amber-lo)',
  LOW:      'var(--surface2)',
  UNKNOWN:  'var(--surface2)',
  ERROR:    'var(--red-lo)',
  WARNING:  'var(--amber-lo)',
  INFO:     'var(--purple-lo)',
};

function SeverityBadge({ sev }: { sev: string }) {
  return (
    <span
      className="font-mono text-xs px-1.5 py-0.5 rounded flex-shrink-0"
      style={{ background: SEV_BG[sev] ?? 'var(--surface2)', color: SEV_COLOR[sev] ?? 'var(--text-dim)' }}
    >
      {sev}
    </span>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const SCAN_CACHE_KEY = 'lynx_security_scan';

function loadCachedScan(): ScanResult | null {
  try {
    const s = localStorage.getItem(SCAN_CACHE_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export function SecurityPage() {
  const config = getConfig();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(loadCachedScan);
  const [scanError, setScanError] = useState('');
  const [tab, setTab] = useState<'cve' | 'sast'>('cve');

  const handleScan = async () => {
    if (!config?.projectPath || scanning) return;
    setScanning(true);
    setScanError('');
    setResult(null);

    try {
      const r = await fetch('/api/security/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectPath: config.projectPath }),
      });

      if (!r.ok) {
        // Security scan API not yet wired — show helpful fallback
        setScanError(
          'Security scan API is planned for Phase 4 (Semgrep + Trivy).\n\n' +
          'To run manually:\n' +
          `  cd ${config.projectPath}\n` +
          '  npx audit-ci --moderate        # Node CVE check\n' +
          '  pip-audit                       # Python CVE check\n' +
          '  semgrep --config=auto .         # SAST scan'
        );
        setScanning(false);
        return;
      }

      const data: ScanResult = await r.json();
      setResult(data);
      try { localStorage.setItem(SCAN_CACHE_KEY, JSON.stringify(data)); } catch { /* quota */ }
    } catch {
      setScanError(
        'Security scan API not available.\n\n' +
        'Phase 4 will include:\n' +
        '  • Trivy: dependency CVE scanning\n' +
        '  • Semgrep: SAST pattern analysis\n' +
        '  • Falco: runtime threat detection\n\n' +
        'In the meantime, use Brain → /security for an AI-assisted security review.'
      );
    } finally {
      setScanning(false);
    }
  };

  const criticalCount = result?.cves.filter(c => c.severity === 'CRITICAL').length ?? 0;
  const highCount     = result?.cves.filter(c => c.severity === 'HIGH').length ?? 0;
  const sastErrors    = result?.sast.filter(s => s.severity === 'ERROR').length ?? 0;

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-base font-semibold">security</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
            CVE scanning · SAST · runtime detection
          </p>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <>
              {result.scannedAt && (
                <span className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>
                  {formatDistanceToNow(new Date(result.scannedAt), { addSuffix: true })}
                </span>
              )}
              <span
                className="badge text-xs font-mono"
                style={{
                  background: criticalCount > 0 || highCount > 0 ? 'var(--red-lo)' : 'var(--teal-lo)',
                  color: criticalCount > 0 || highCount > 0 ? 'var(--red)' : 'var(--teal)',
                  border: `1px solid ${criticalCount > 0 || highCount > 0 ? 'rgba(224,85,85,0.3)' : 'rgba(29,184,124,0.3)'}`,
                }}
              >
                {criticalCount + highCount > 0 ? `${criticalCount + highCount} critical/high` : '✓ clean'}
              </span>
            </>
          )}
          <button
            className="btn btn-primary text-xs"
            onClick={handleScan}
            disabled={scanning || !config?.projectPath}
          >
            {scanning ? '…scanning' : '⬡ Run scan'}
          </button>
        </div>
      </div>

      {/* Scan error / hint */}
      <AnimatePresence>
        {scanError && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded p-4 mb-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <pre className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
              {scanError}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats */}
      {result && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'critical CVEs', value: criticalCount, color: criticalCount > 0 ? '#ff3333' : 'var(--teal)' },
            { label: 'high CVEs',     value: highCount,     color: highCount > 0 ? 'var(--red)' : 'var(--teal)' },
            { label: 'SAST errors',  value: sastErrors,    color: sastErrors > 0 ? 'var(--red)' : 'var(--teal)' },
            { label: 'total deps',   value: result.cves.length, color: 'var(--text-dim)' },
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
              <p className="text-2xl font-mono font-bold" style={{ color: s.color }}>{s.value}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Tabs */}
      {result && (
        <>
          <div className="flex gap-1 mb-4">
            {(['cve', 'sast'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="text-xs font-mono px-3 py-1.5 rounded transition-all"
                style={{
                  background: tab === t ? 'var(--overlay)' : 'transparent',
                  color: tab === t ? 'var(--text)' : 'var(--text-dim)',
                  border: `1px solid ${tab === t ? 'var(--border-lit)' : 'transparent'}`,
                }}
              >
                {t === 'cve' ? `CVEs (${result.cves.length})` : `SAST (${result.sast.length})`}
              </button>
            ))}
          </div>

          {/* CVE list */}
          {tab === 'cve' && (
            <motion.div
              key="cve"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-2"
            >
              {result.cves.length === 0 ? (
                <div className="rounded p-6 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--teal)' }}>✓ No CVEs found</p>
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>All dependencies appear clean.</p>
                </div>
              ) : result.cves.map((cve, i) => (
                <motion.div
                  key={cve.cveId + i}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="rounded px-4 py-3 flex items-start gap-3"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <SeverityBadge sev={cve.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{cve.packageName} <span className="font-mono" style={{ color: 'var(--text-mute)' }}>{cve.installedVersion}</span></p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{cve.title}</p>
                    <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-mute)' }}>{cve.cveId}{cve.fixedVersion ? ` · fix: ${cve.fixedVersion}` : ''}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* SAST list */}
          {tab === 'sast' && (
            <motion.div
              key="sast"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-2"
            >
              {result.sast.length === 0 ? (
                <div className="rounded p-6 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--teal)' }}>✓ No SAST findings</p>
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>No static analysis issues detected.</p>
                </div>
              ) : result.sast.map((s, i) => (
                <motion.div
                  key={s.ruleId + i}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="rounded px-4 py-3 flex items-start gap-3"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <SeverityBadge sev={s.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold font-mono">{s.file}:{s.line}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{s.message}</p>
                    <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-mute)' }}>{s.ruleId}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* LLM summary */}
          {result.summary && (
            <motion.div
              className="rounded p-4 mt-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <p className="section-title mb-2">ai summary</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>{result.summary}</p>
            </motion.div>
          )}
        </>
      )}

      {/* No scan yet */}
      {!result && !scanning && !scanError && (
        <div
          className="rounded p-8 text-center"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-4 font-mono"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border-lit)', color: 'var(--text-mute)' }}
          >
            ⬡
          </div>
          <p className="font-semibold text-sm mb-2">No scan yet</p>
          <p className="text-xs mb-4" style={{ color: 'var(--text-dim)' }}>
            Run a scan to check for CVEs and SAST findings in your project.
          </p>
          <p className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>
            Or try Brain → type <code>/security</code> for an AI-assisted review
          </p>
        </div>
      )}
    </div>
  );
}

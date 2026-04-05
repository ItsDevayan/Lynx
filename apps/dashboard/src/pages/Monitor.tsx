import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

interface Tracker {
  fingerprint: string;
  errorName: string;
  layer: string;
  severity: string;
  sampleMessage: string;
  occurrences: number;
  affectedUserCount: number;
  lastOccurrence: string;
  resolved: boolean;
  regressed: boolean;
  regressionCount: number;
}

async function fetchTrackers(): Promise<{ trackers: Tracker[] }> {
  const r = await fetch('/api/monitor/trackers?resolved=false');
  return r.json();
}

const SEV: Record<string, { bg: string; fg: string; border: string }> = {
  DEBUG: { bg: 'rgba(104,104,160,0.1)', fg: 'var(--text-dim)',  border: 'rgba(104,104,160,0.2)' },
  INFO:  { bg: 'var(--purple-lo)',       fg: 'var(--purple-hi)', border: 'rgba(124,111,205,0.3)' },
  WARN:  { bg: 'var(--amber-lo)',        fg: 'var(--amber)',     border: 'rgba(212,160,23,0.3)'  },
  ERROR: { bg: 'var(--red-lo)',          fg: 'var(--red)',       border: 'rgba(224,85,85,0.3)'   },
  FATAL: { bg: 'rgba(255,51,51,0.12)',   fg: '#ff4444',          border: 'rgba(255,51,51,0.3)'   },
};

export function MonitorPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['trackers'],
    queryFn: fetchTrackers,
    refetchInterval: 20_000,
  });

  const resolve = useMutation({
    mutationFn: async (fingerprint: string) => {
      await fetch(`/api/monitor/trackers/${encodeURIComponent(fingerprint)}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ by: 'dashboard' }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trackers'] }),
  });

  const trackers = data?.trackers ?? [];

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-base font-semibold">monitor</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
            error dedup · fingerprinting · regression tracking
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-info">{trackers.length} unresolved</span>
        </div>
      </div>

      {/* Column headers */}
      {trackers.length > 0 && (
        <div
          className="grid text-xs font-mono mb-2 px-3"
          style={{ gridTemplateColumns: '80px 1fr 80px 80px 100px 70px', color: 'var(--text-mute)', letterSpacing: '0.05em' }}
        >
          <span>SEV</span>
          <span>ERROR</span>
          <span>LAYER</span>
          <span>COUNT</span>
          <span>LAST SEEN</span>
          <span></span>
        </div>
      )}

      <div className="space-y-1.5">
        {trackers.map((t, i) => {
          const sev = SEV[t.severity] ?? SEV.ERROR;
          return (
            <motion.div
              key={t.fingerprint}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="group rounded"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div
                className="grid items-center px-3 py-2.5 text-xs gap-2"
                style={{ gridTemplateColumns: '80px 1fr 80px 80px 100px 70px' }}
              >
                {/* Severity */}
                <div className="flex items-center gap-1.5">
                  <span
                    className="badge font-mono"
                    style={{ background: sev.bg, color: sev.fg, border: `1px solid ${sev.border}` }}
                  >
                    {t.severity}
                  </span>
                </div>

                {/* Error name + message */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono font-medium truncate" style={{ color: 'var(--text)' }}>
                      {t.errorName}
                    </span>
                    {t.regressed && (
                      <span className="badge" style={{ background: 'var(--red-lo)', color: 'var(--red)', border: '1px solid rgba(224,85,85,0.3)', fontSize: 10 }}>
                        ↩ ×{t.regressionCount}
                      </span>
                    )}
                  </div>
                  <p className="truncate font-mono" style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                    {t.sampleMessage}
                  </p>
                </div>

                {/* Layer */}
                <span className="font-mono truncate" style={{ color: 'var(--text-dim)' }}>{t.layer}</span>

                {/* Count */}
                <span className="font-mono tabular-nums" style={{ color: 'var(--text)' }}>×{t.occurrences}</span>

                {/* Last seen */}
                <span className="font-mono" style={{ color: 'var(--text-dim)' }}>
                  {formatDistanceToNow(new Date(t.lastOccurrence), { addSuffix: false })} ago
                </span>

                {/* Action */}
                <button
                  onClick={() => resolve.mutate(t.fingerprint)}
                  disabled={resolve.isPending}
                  className="text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--teal)' }}
                >
                  resolve
                </button>
              </div>
            </motion.div>
          );
        })}

        {isLoading && (
          <div className="space-y-1.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 rounded shimmer" style={{ borderRadius: 4 }} />
            ))}
          </div>
        )}

        {!isLoading && trackers.length === 0 && (
          <div className="text-center py-24">
            <p className="font-mono text-4xl mb-4" style={{ color: 'var(--text-mute)' }}>○</p>
            <p className="font-semibold mb-1">no active errors</p>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
              Ship it. Point your app at <span className="font-mono" style={{ color: 'var(--purple)' }}>POST /api/ingest</span> to start capturing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

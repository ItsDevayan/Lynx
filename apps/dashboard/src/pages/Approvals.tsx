/**
 * Lynx Approvals — HITL queue
 *
 * Shows pending change proposals from Lynx.
 * Supports: approve · reject (with notes) · diff view · payload viewer
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HITLProposal {
  type: 'diff' | 'command' | 'config' | 'plan' | 'json';
  content: string;
  files?: string[];
  reversible: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface HITLRequest {
  id: string;
  action: string;
  title: string;
  description: string;
  thinking?: string;
  proposal?: HITLProposal;
  // legacy (old format)
  type?: string;
  payload?: Record<string, unknown>;
  status: string;
  createdAt: string;
}

interface ApproveResult {
  ok: boolean;
  applied?: boolean;
  modifiedFiles?: string[];
  savedTo?: string;
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchPending(): Promise<{ requests: HITLRequest[] }> {
  const r = await fetch('/api/hitl');
  return r.json();
}

async function approveRequest(id: string, notes?: string): Promise<ApproveResult> {
  const r = await fetch(`/api/hitl/${id}/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ by: 'dashboard-user', notes, apply: true }),
  });
  return r.json();
}

async function rejectRequest(id: string, notes?: string): Promise<void> {
  await fetch(`/api/hitl/${id}/reject`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ by: 'dashboard-user', notes }),
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACTION_ICON: Record<string, string> = {
  CODE_CHANGE:        '◈',
  SECURITY_FIX:       '⬡',
  DEPENDENCY_UPDATE:  '◎',
  DEPLOY:             '◉',
  CONFIG_CHANGE:      '⚙',
  code_change:        '◈',
  security_fix:       '⬡',
};

const ACTION_COLOR: Record<string, string> = {
  CODE_CHANGE:        'var(--purple-hi)',
  SECURITY_FIX:       'var(--red)',
  DEPENDENCY_UPDATE:  'var(--amber)',
  DEPLOY:             'var(--teal)',
  CONFIG_CHANGE:      'var(--text-dim)',
  code_change:        'var(--purple-hi)',
};

const RISK_COLOR: Record<string, string> = {
  LOW:      'var(--teal)',
  MEDIUM:   'var(--amber)',
  HIGH:     'var(--red)',
  CRITICAL: '#ff3333',
};

/** Render a unified diff with line-level coloring */
function DiffViewer({ diff }: { diff: string }) {
  const lines = diff.split('\n');
  return (
    <div
      className="rounded overflow-auto text-xs font-mono"
      style={{ background: 'var(--bg)', border: '1px solid var(--border)', maxHeight: 320 }}
    >
      {lines.map((line, i) => {
        let bg = 'transparent';
        let color = 'var(--text-dim)';
        if (line.startsWith('+') && !line.startsWith('+++')) { bg = 'rgba(29,184,124,0.08)'; color = 'var(--teal)'; }
        if (line.startsWith('-') && !line.startsWith('---')) { bg = 'rgba(224,85,85,0.08)';  color = 'var(--red)'; }
        if (line.startsWith('@@'))                            { bg = 'rgba(124,111,205,0.08)'; color = 'var(--purple-hi)'; }
        if (line.startsWith('+++') || line.startsWith('---')) color = 'var(--text-mute)';
        return (
          <div key={i} className="px-3 py-0.5 whitespace-pre" style={{ background: bg, color }}>
            {line || ' '}
          </div>
        );
      })}
    </div>
  );
}

// ─── Request card ─────────────────────────────────────────────────────────────

function RequestCard({
  req,
  onApprove,
  onReject,
  isPending,
}: {
  req: HITLRequest;
  onApprove: () => Promise<ApproveResult>;
  onReject: (notes?: string) => void;
  isPending: boolean;
}) {
  const [showPayload, setShowPayload] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [notes, setNotes] = useState('');
  const [applyResult, setApplyResult] = useState<ApproveResult | null>(null);

  // Support both old (payload.diff) and new (proposal.content) formats
  const diff = req.proposal?.content
    ?? req.payload?.['diff'] as string | undefined
    ?? req.payload?.['patch'] as string | undefined;

  const proposalType = req.proposal?.type ?? (diff ? 'diff' : 'json');
  const riskLevel    = req.proposal?.riskLevel;
  const actionKey    = req.action ?? req.type ?? '';
  const icon         = ACTION_ICON[actionKey]  ?? '◇';
  const color        = ACTION_COLOR[actionKey] ?? 'var(--text-dim)';

  const handleApprove = async () => {
    const result = await onApprove();
    setApplyResult(result);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="rounded overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div
        className="px-5 py-3 flex items-center justify-between gap-4"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-sm flex-shrink-0" style={{ color }}>{icon}</span>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">{req.title}</h3>
            <p className="text-xs font-mono mt-0.5 flex items-center gap-2" style={{ color: 'var(--text-mute)' }}>
              <span>{actionKey.toLowerCase().replace(/_/g, ' ')}</span>
              {riskLevel && (
                <span className="font-mono px-1.5 rounded" style={{ fontSize: 9, background: 'var(--surface)', color: RISK_COLOR[riskLevel] ?? 'var(--text-dim)', border: `1px solid ${RISK_COLOR[riskLevel] ?? 'var(--border)'}40` }}>
                  {riskLevel}
                </span>
              )}
              <span>· {formatDistanceToNow(new Date(req.createdAt))} ago</span>
            </p>
          </div>
        </div>
        <span
          className="font-mono text-xs px-2 py-0.5 rounded flex-shrink-0"
          style={{ background: 'var(--amber-lo)', color: 'var(--amber)', border: '1px solid rgba(212,160,23,0.3)' }}
        >
          PENDING
        </span>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>
          {req.description}
        </p>

        {/* Thinking toggle */}
        {req.thinking && (
          <div>
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="text-xs font-mono"
              style={{ color: 'var(--text-mute)', textDecoration: 'underline dotted' }}
            >
              {showThinking ? '▼ hide reasoning' : '▶ show reasoning'}
            </button>
            <AnimatePresence>
              {showThinking && (
                <motion.pre
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-xs p-3 rounded overflow-x-auto mt-2 whitespace-pre-wrap leading-relaxed"
                  style={{ background: 'var(--bg)', color: 'var(--purple-hi)', border: '1px solid var(--border)' }}
                >
                  {req.thinking}
                </motion.pre>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Diff / content viewer */}
        {diff && proposalType === 'diff' && <DiffViewer diff={diff} />}
        {diff && proposalType !== 'diff' && (
          <div>
            <button
              onClick={() => setShowPayload(!showPayload)}
              className="text-xs font-mono"
              style={{ color: 'var(--text-mute)', textDecoration: 'underline dotted' }}
            >
              {showPayload ? `hide ${proposalType}` : `show ${proposalType}`}
            </button>
            <AnimatePresence>
              {showPayload && (
                <motion.pre
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-xs p-3 rounded overflow-x-auto mt-2"
                  style={{ background: 'var(--bg)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}
                >
                  {diff}
                </motion.pre>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Apply result */}
        {applyResult && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded p-3 text-xs"
            style={{
              background: applyResult.applied ? 'var(--teal-lo)' : 'var(--surface2)',
              border: `1px solid ${applyResult.applied ? 'rgba(29,184,124,0.3)' : 'var(--border)'}`,
            }}
          >
            {applyResult.applied ? (
              <>
                <p className="font-mono font-semibold mb-1" style={{ color: 'var(--teal)' }}>✓ Applied to disk</p>
                {applyResult.modifiedFiles && applyResult.modifiedFiles.length > 0 && (
                  <p className="font-mono" style={{ color: 'var(--text-dim)' }}>
                    Modified: {applyResult.modifiedFiles.join(', ')}
                  </p>
                )}
                {applyResult.savedTo && (
                  <p className="font-mono" style={{ color: 'var(--text-dim)' }}>
                    Saved to: {applyResult.savedTo}
                  </p>
                )}
              </>
            ) : (
              <p className="font-mono" style={{ color: 'var(--text-dim)' }}>Approved (no diff to apply)</p>
            )}
          </motion.div>
        )}

        {/* Reject notes input */}
        <AnimatePresence>
          {rejecting && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <textarea
                className="w-full rounded px-3 py-2 text-xs font-mono outline-none resize-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--red)40', color: 'var(--text)', height: 64 }}
                placeholder="Reason for rejection (optional)…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleApprove}
            disabled={isPending || !!applyResult}
            className="btn text-xs px-4 py-1.5 rounded font-medium"
            style={{ background: 'var(--teal-lo)', color: 'var(--teal)', border: '1px solid rgba(29,184,124,0.3)', opacity: applyResult ? 0.5 : 1 }}
          >
            {applyResult ? '✓ Approved' : '✓ Approve + Apply'}
          </button>

          {rejecting ? (
            <>
              <button
                onClick={() => { onReject(notes || undefined); setRejecting(false); }}
                disabled={isPending}
                className="btn text-xs px-4 py-1.5 rounded font-medium"
                style={{ background: 'var(--red-lo)', color: 'var(--red)', border: '1px solid rgba(224,85,85,0.3)' }}
              >
                ✗ Confirm reject
              </button>
              <button
                onClick={() => { setRejecting(false); setNotes(''); }}
                className="btn btn-ghost text-xs"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setRejecting(true)}
              disabled={isPending}
              className="btn text-xs px-4 py-1.5 rounded font-medium"
              style={{ background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}
            >
              ✗ Reject
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ApprovalsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['hitl'],
    queryFn: fetchPending,
    refetchInterval: 5_000,
  });

  const approve = useMutation({
    mutationFn: (id: string) => approveRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hitl'] }),
  });

  const reject = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => rejectRequest(id, notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hitl'] }),
  });

  const requests = data?.requests ?? [];

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-base font-semibold">approvals</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
            Lynx proposes · you decide · nothing happens without your approval
          </p>
        </div>
        {requests.length > 0 && (
          <span
            className="flex items-center gap-2 text-xs font-mono px-3 py-1 rounded"
            style={{ background: 'var(--amber-lo)', color: 'var(--amber)', border: '1px solid rgba(212,160,23,0.3)' }}
          >
            <span className="pulse-dot" style={{ background: 'var(--amber)', width: 6, height: 6 }} />
            {requests.length} pending
          </span>
        )}
      </div>

      {isLoading && (
        <p className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>loading queue…</p>
      )}

      <div className="space-y-3">
        <AnimatePresence>
          {requests.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              isPending={approve.isPending || reject.isPending}
              onApprove={() => approve.mutateAsync(req.id)}
              onReject={(notes) => reject.mutate({ id: req.id, notes })}
            />
          ))}
        </AnimatePresence>

        {!isLoading && requests.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-4 font-mono"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--teal)' }}
            >
              ✓
            </div>
            <p className="font-semibold text-sm mb-1">All clear</p>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
              No pending approvals. Lynx is waiting for work.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

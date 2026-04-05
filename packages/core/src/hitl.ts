/**
 * Lynx — Human-in-the-Loop (HITL) Middleware
 *
 * Iron rule: Lynx never modifies code, infra, or config without explicit approval.
 *
 * Every mutative action flows through this module:
 *   1. Agent proposes action → createRequest()
 *   2. Request serialized to PostgreSQL
 *   3. WebSocket push to dashboard
 *   4. Human reviews: approve / reject / modify
 *   5. Agent execution resumes or is cancelled
 */

import { randomUUID } from 'crypto';
import type {
  HITLRequest,
  HITLAction,
  HITLStatus,
  NotificationPayload,
} from './types.js';

// ─── In-memory waiters (per request ID) ──────────────────────────────────────

type HITLResolver = {
  resolve: (result: { approved: boolean; modified?: string; reason?: string }) => void;
  reject: (err: Error) => void;
  timeoutHandle: NodeJS.Timeout;
};

const waiters = new Map<string, HITLResolver>();

// ─── HITL Event Bus (injected by apps/api) ────────────────────────────────────

export interface HITLEventEmitter {
  emit(event: 'hitl:created', request: HITLRequest): void;
  emit(event: 'hitl:resolved', requestId: string, status: HITLStatus, by?: string): void;
}

let eventEmitter: HITLEventEmitter | null = null;

export function setHITLEventEmitter(emitter: HITLEventEmitter): void {
  eventEmitter = emitter;
}

// ─── DB adapter (injected by apps/api) ────────────────────────────────────────

export interface HITLStore {
  save(request: HITLRequest): Promise<void>;
  update(id: string, updates: Partial<HITLRequest>): Promise<void>;
  getById(id: string): Promise<HITLRequest | null>;
  listPending(projectId?: string): Promise<HITLRequest[]>;
}

let store: HITLStore | null = null;

export function setHITLStore(s: HITLStore): void {
  store = s;
}

// ─── Core API ─────────────────────────────────────────────────────────────────

export interface CreateHITLOptions {
  action: HITLAction;
  title: string;
  description: string;
  thinking?: string;
  proposal: HITLRequest['proposal'];
  context: HITLRequest['context'];
  timeoutMs?: number;  // default 24h
}

/**
 * Create a HITL request and wait for human approval.
 *
 * Returns a promise that resolves when the human approves/rejects,
 * or rejects if the timeout expires.
 *
 * Usage:
 *   const result = await requestApproval({ ... });
 *   if (result.approved) { applyFix(result.modified ?? proposal.content); }
 */
export async function requestApproval(opts: CreateHITLOptions): Promise<{
  approved: boolean;
  modified?: string;
  reason?: string;
}> {
  const request: HITLRequest = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + (opts.timeoutMs ?? 86_400_000)).toISOString(),
    status: 'PENDING',
    action: opts.action,
    title: opts.title,
    description: opts.description,
    thinking: opts.thinking,
    proposal: opts.proposal,
    context: opts.context,
  };

  // Persist
  if (store) await store.save(request);

  // Notify dashboard via event bus
  eventEmitter?.emit('hitl:created', request);

  // Return a promise that resolves when the human responds
  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      waiters.delete(request.id);
      reject(new Error(`HITL request ${request.id} timed out after ${opts.timeoutMs ?? 86400000}ms`));
    }, opts.timeoutMs ?? 86_400_000);

    waiters.set(request.id, { resolve, reject, timeoutHandle });
  });
}

/**
 * Called by apps/api when a human approves/rejects from the dashboard.
 */
export async function resolveRequest(
  id: string,
  status: 'APPROVED' | 'REJECTED' | 'MODIFIED',
  opts: {
    by?: string;
    modifiedProposal?: string;
    rejectionReason?: string;
  } = {},
): Promise<void> {
  const waiter = waiters.get(id);

  const updates: Partial<HITLRequest> = {
    status,
    ...(status === 'APPROVED' && { approvedBy: opts.by, approvedAt: new Date().toISOString() }),
    ...(status === 'REJECTED' && {
      rejectedBy: opts.by,
      rejectedAt: new Date().toISOString(),
      rejectionReason: opts.rejectionReason,
    }),
    ...(status === 'MODIFIED' && {
      approvedBy: opts.by,
      approvedAt: new Date().toISOString(),
      modifiedProposal: opts.modifiedProposal,
    }),
  };

  if (store) await store.update(id, updates);
  eventEmitter?.emit('hitl:resolved', id, status, opts.by);

  if (waiter) {
    clearTimeout(waiter.timeoutHandle);
    waiters.delete(id);

    if (status === 'REJECTED') {
      waiter.resolve({ approved: false, reason: opts.rejectionReason });
    } else {
      waiter.resolve({
        approved: true,
        modified: opts.modifiedProposal,
      });
    }
  }
}

/**
 * Build a notification payload for a HITL request
 * (sent via core/notifier to Slack/Discord/email).
 */
export function buildHITLNotification(request: HITLRequest): NotificationPayload {
  const riskEmoji = {
    LOW: '🟢',
    MEDIUM: '🟡',
    HIGH: '🟠',
    CRITICAL: '🔴',
  }[request.proposal.riskLevel];

  return {
    title: `⏸ Approval Required: ${request.title}`,
    body: request.description,
    severity: request.proposal.riskLevel === 'CRITICAL' ? 'critical' : 'warning',
    fields: [
      { name: 'Action', value: request.action, inline: true },
      { name: 'Risk', value: `${riskEmoji} ${request.proposal.riskLevel}`, inline: true },
      { name: 'Reversible', value: request.proposal.reversible ? '✅ Yes' : '❌ No', inline: true },
      { name: 'Triggered by', value: request.context.triggeredBy, inline: true },
    ],
    actions: [
      { label: '✅ Approve', url: `http://localhost:3000/approvals/${request.id}?action=approve`, style: 'primary' },
      { label: '❌ Reject', url: `http://localhost:3000/approvals/${request.id}?action=reject`, style: 'danger' },
    ],
    footer: `Request ID: ${request.id} • Expires: ${request.expiresAt}`,
  };
}

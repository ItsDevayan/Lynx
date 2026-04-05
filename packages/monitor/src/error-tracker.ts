/**
 * Lynx Monitor — Error Tracker (Deduplication)
 *
 * Core dedup flow (rebuilt from LEMU's battle-tested pattern):
 *   1. Event arrives with fingerprint
 *   2. Check if fingerprint exists in error_trackers table
 *   3. NEW     → create tracker + alert
 *   4. EXISTING → increment counter, update users/versions, NO alert
 *   5. REGRESSION (was resolved, came back) → re-open + alert with "REGRESSED Nx" badge
 */

import type { LynxEvent, ErrorTracker, AffectedUser } from '@lynx/core';

export interface UpsertResult {
  tracker: ErrorTracker;
  isNew: boolean;
  isRegression: boolean;
}

// ─── Store Interface (implemented by apps/api with PostgreSQL) ────────────────

export interface ErrorTrackerStore {
  findByFingerprint(fingerprint: string, projectId?: string): Promise<ErrorTracker | null>;
  create(tracker: ErrorTracker): Promise<ErrorTracker>;
  update(fingerprint: string, updates: Partial<ErrorTracker>): Promise<ErrorTracker>;
  findUnresolved(projectId?: string, limit?: number): Promise<ErrorTracker[]>;
  resolve(fingerprint: string, by: string, notes?: string): Promise<ErrorTracker>;
  listAll(projectId?: string, opts?: { limit?: number; page?: number }): Promise<ErrorTracker[]>;
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

export async function upsertError(
  event: LynxEvent,
  store: ErrorTrackerStore,
): Promise<UpsertResult> {
  const fingerprint = event.fingerprint!;
  const existing = await store.findByFingerprint(fingerprint, event.projectId);

  if (!existing) {
    // NEW error — create tracker
    const tracker = await store.create(buildNewTracker(event));
    return { tracker, isNew: true, isRegression: false };
  }

  // REGRESSION check: was resolved but came back
  const isRegression = existing.resolved;

  // Build update
  const affectedUsers = mergeAffectedUser(existing.affectedUsers, event);
  const affectedVersions = mergeVersions(existing.affectedVersions, event.version);

  const updates: Partial<ErrorTracker> = {
    occurrences: existing.occurrences + 1,
    lastOccurrence: event.timestamp ?? new Date().toISOString(),
    affectedUsers,
    affectedUserCount: countUniqueUsers(affectedUsers),
    affectedVersions,
    ...(isRegression && {
      resolved: false,
      resolvedBy: undefined,
      resolvedAt: undefined,
      regressed: true,
      regressionCount: (existing.regressionCount ?? 0) + 1,
      expiresAt: null, // re-pin as permanent
    }),
  };

  const tracker = await store.update(fingerprint, updates);
  return { tracker, isNew: false, isRegression };
}

function buildNewTracker(event: LynxEvent): ErrorTracker {
  const now = event.timestamp ?? new Date().toISOString();
  return {
    fingerprint: event.fingerprint!,
    errorName: extractErrorName(event.message),
    layer: event.layer ?? 'SYSTEM',
    severity: event.severity,
    projectId: event.projectId,
    sampleMessage: event.message,
    occurrences: 1,
    affectedUserCount: event.userId || event.userEmail ? 1 : 0,
    affectedUsers: buildAffectedUser(event) ? [buildAffectedUser(event)!] : [],
    affectedVersions: event.version ? [event.version] : [],
    firstOccurrence: now,
    lastOccurrence: now,
    resolved: false,
    regressed: false,
    regressionCount: 0,
    expiresAt: null, // ERROR/FATAL never expire until resolved
  };
}

function buildAffectedUser(event: LynxEvent): AffectedUser | null {
  if (!event.userId && !event.userEmail) return null;
  return {
    userId: event.userId,
    userEmail: event.userEmail,
    userName: event.userName,
    count: 1,
    lastSeen: event.timestamp ?? new Date().toISOString(),
    environment: event.environment,
  };
}

function mergeAffectedUser(existing: AffectedUser[], event: LynxEvent): AffectedUser[] {
  const user = buildAffectedUser(event);
  if (!user) return existing;

  const key = user.userId ?? user.userEmail;
  if (!key) return existing;

  const idx = existing.findIndex((u) => (u.userId ?? u.userEmail) === key);
  if (idx === -1) {
    return [...existing, user].slice(-100); // cap at 100 users
  }

  const updated = [...existing];
  updated[idx] = {
    ...updated[idx],
    count: updated[idx].count + 1,
    lastSeen: user.lastSeen,
    environment: user.environment ?? updated[idx].environment,
  };
  return updated;
}

function mergeVersions(existing: string[], version?: string): string[] {
  if (!version || existing.includes(version)) return existing;
  return [...existing, version].slice(-20); // cap at 20 versions
}

function countUniqueUsers(users: AffectedUser[]): number {
  const keys = new Set(users.map((u) => u.userId ?? u.userEmail).filter(Boolean));
  return keys.size;
}

function extractErrorName(message: string): string {
  const match = message.match(/^([A-Za-z]+(?:Error|Exception|Fault)):/);
  return match ? match[1] : 'Error';
}

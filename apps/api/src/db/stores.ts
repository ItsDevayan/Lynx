/**
 * PostgreSQL implementations of EventStore and ErrorTrackerStore.
 */

import type { LynxEvent, ErrorTracker, AffectedUser } from '@lynx/core';
import type { EventStore } from '@lynx/monitor';
import type { ErrorTrackerStore } from '@lynx/monitor';
import { query } from './pg.js';

// ─── EventStore (PostgreSQL) ─────────────────────────────────────────────────

export class PgEventStore implements EventStore {
  async insertMany(events: LynxEvent[]): Promise<void> {
    if (events.length === 0) return;

    const placeholders = events
      .map((_, i) => {
        const base = i * 13;
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13})`;
      })
      .join(',');

    const values = events.flatMap((e) => [
      e.id,
      e.timestamp,
      e.severity,
      e.layer,
      e.message,
      e.fingerprint ?? null,
      e.projectId ?? null,
      e.userId ?? null,
      e.userEmail ?? null,
      e.traceId ?? null,
      e.spanId ?? null,
      e.expiresAt ?? null,
      JSON.stringify(e.attributes ?? {}),
    ]);

    await query(
      `INSERT INTO events
        (id, timestamp, severity, layer, message, fingerprint, project_id,
         user_id, user_email, trace_id, span_id, expires_at, attributes)
       VALUES ${placeholders}
       ON CONFLICT (id) DO NOTHING`,
      values,
    );
  }

  async findByFingerprint(fingerprint: string, limit = 50): Promise<LynxEvent[]> {
    const res = await query<Record<string, unknown>>(
      `SELECT * FROM events WHERE fingerprint = $1 ORDER BY timestamp DESC LIMIT $2`,
      [fingerprint, limit],
    );
    return res.rows.map(rowToEvent);
  }

  async findRecent(projectId?: string, limit = 100): Promise<LynxEvent[]> {
    const res = projectId
      ? await query<Record<string, unknown>>(
          `SELECT * FROM events WHERE project_id = $1 ORDER BY timestamp DESC LIMIT $2`,
          [projectId, limit],
        )
      : await query<Record<string, unknown>>(
          `SELECT * FROM events ORDER BY timestamp DESC LIMIT $1`,
          [limit],
        );
    return res.rows.map(rowToEvent);
  }

  async deleteExpired(): Promise<number> {
    const res = await query(
      `DELETE FROM events WHERE expires_at IS NOT NULL AND expires_at < NOW()`,
    );
    return res.rowCount ?? 0;
  }

  async countBySeverity(projectId?: string): Promise<Record<string, number>> {
    const res = projectId
      ? await query<{ severity: string; count: string }>(
          `SELECT severity, COUNT(*)::int as count FROM events WHERE project_id = $1 GROUP BY severity`,
          [projectId],
        )
      : await query<{ severity: string; count: string }>(
          `SELECT severity, COUNT(*)::int as count FROM events GROUP BY severity`,
        );
    const map: Record<string, number> = {};
    for (const row of res.rows) {
      map[row.severity] = parseInt(row.count, 10);
    }
    return map;
  }
}

function rowToEvent(row: Record<string, unknown>): LynxEvent {
  return {
    id: row['id'] as string,
    timestamp: row['timestamp'] as string,
    severity: row['severity'] as LynxEvent['severity'],
    layer: row['layer'] as string,
    message: row['message'] as string,
    fingerprint: row['fingerprint'] as string | undefined,
    projectId: row['project_id'] as string | undefined,
    userId: row['user_id'] as string | undefined,
    userEmail: row['user_email'] as string | undefined,
    traceId: row['trace_id'] as string | undefined,
    spanId: row['span_id'] as string | undefined,
    expiresAt: row['expires_at'] as string | null | undefined,
    attributes: row['attributes'] as Record<string, unknown> | undefined,
  };
}

// ─── ErrorTrackerStore (PostgreSQL) ─────────────────────────────────────────

export class PgErrorTrackerStore implements ErrorTrackerStore {
  async findByFingerprint(fingerprint: string, projectId?: string): Promise<ErrorTracker | null> {
    const res = projectId
      ? await query<Record<string, unknown>>(
          `SELECT * FROM error_trackers WHERE fingerprint = $1 AND project_id = $2 LIMIT 1`,
          [fingerprint, projectId],
        )
      : await query<Record<string, unknown>>(
          `SELECT * FROM error_trackers WHERE fingerprint = $1 LIMIT 1`,
          [fingerprint],
        );
    return res.rows.length ? rowToTracker(res.rows[0]) : null;
  }

  async create(tracker: ErrorTracker): Promise<ErrorTracker> {
    const res = await query<Record<string, unknown>>(
      `INSERT INTO error_trackers
        (fingerprint, error_name, layer, severity, project_id, sample_message,
         occurrences, affected_user_count, affected_users, affected_versions,
         first_occurrence, last_occurrence, resolved, regressed, regression_count, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        tracker.fingerprint,
        tracker.errorName,
        tracker.layer,
        tracker.severity,
        tracker.projectId ?? null,
        tracker.sampleMessage,
        tracker.occurrences,
        tracker.affectedUserCount,
        JSON.stringify(tracker.affectedUsers),
        JSON.stringify(tracker.affectedVersions),
        tracker.firstOccurrence,
        tracker.lastOccurrence,
        tracker.resolved,
        tracker.regressed,
        tracker.regressionCount,
        tracker.expiresAt ?? null,
      ],
    );
    return rowToTracker(res.rows[0]);
  }

  async update(fingerprint: string, updates: Partial<ErrorTracker>): Promise<ErrorTracker> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    const colMap: Record<string, string> = {
      occurrences: 'occurrences',
      lastOccurrence: 'last_occurrence',
      affectedUsers: 'affected_users',
      affectedUserCount: 'affected_user_count',
      affectedVersions: 'affected_versions',
      resolved: 'resolved',
      resolvedBy: 'resolved_by',
      resolvedAt: 'resolved_at',
      regressed: 'regressed',
      regressionCount: 'regression_count',
      expiresAt: 'expires_at',
    };

    for (const [key, col] of Object.entries(colMap)) {
      if (key in updates) {
        const val = updates[key as keyof ErrorTracker];
        const jsonCols = new Set(['affected_users', 'affected_versions']);
        sets.push(`${col} = $${i++}`);
        vals.push(jsonCols.has(col) ? JSON.stringify(val) : val ?? null);
      }
    }

    if (sets.length === 0) {
      return (await this.findByFingerprint(fingerprint))!;
    }

    vals.push(fingerprint);
    const res = await query<Record<string, unknown>>(
      `UPDATE error_trackers SET ${sets.join(', ')} WHERE fingerprint = $${i} RETURNING *`,
      vals,
    );
    return rowToTracker(res.rows[0]);
  }

  async findUnresolved(projectId?: string, limit = 100): Promise<ErrorTracker[]> {
    const res = projectId
      ? await query<Record<string, unknown>>(
          `SELECT * FROM error_trackers WHERE resolved = false AND project_id = $1
           ORDER BY last_occurrence DESC LIMIT $2`,
          [projectId, limit],
        )
      : await query<Record<string, unknown>>(
          `SELECT * FROM error_trackers WHERE resolved = false
           ORDER BY last_occurrence DESC LIMIT $1`,
          [limit],
        );
    return res.rows.map(rowToTracker);
  }

  async resolve(fingerprint: string, by: string, notes?: string): Promise<ErrorTracker> {
    const res = await query<Record<string, unknown>>(
      `UPDATE error_trackers
       SET resolved = true, resolved_by = $2, resolved_at = NOW(), resolution_notes = $3
       WHERE fingerprint = $1
       RETURNING *`,
      [fingerprint, by, notes ?? null],
    );
    return rowToTracker(res.rows[0]);
  }

  async listAll(projectId?: string, opts?: { limit?: number; page?: number }): Promise<ErrorTracker[]> {
    const limit = opts?.limit ?? 50;
    const offset = ((opts?.page ?? 1) - 1) * limit;

    const res = projectId
      ? await query<Record<string, unknown>>(
          `SELECT * FROM error_trackers WHERE project_id = $1
           ORDER BY last_occurrence DESC LIMIT $2 OFFSET $3`,
          [projectId, limit, offset],
        )
      : await query<Record<string, unknown>>(
          `SELECT * FROM error_trackers ORDER BY last_occurrence DESC LIMIT $1 OFFSET $2`,
          [limit, offset],
        );
    return res.rows.map(rowToTracker);
  }
}

function rowToTracker(row: Record<string, unknown>): ErrorTracker {
  return {
    fingerprint: row['fingerprint'] as string,
    errorName: row['error_name'] as string,
    layer: row['layer'] as string,
    severity: row['severity'] as ErrorTracker['severity'],
    projectId: row['project_id'] as string | undefined,
    sampleMessage: row['sample_message'] as string,
    occurrences: row['occurrences'] as number,
    affectedUserCount: row['affected_user_count'] as number,
    affectedUsers: parseJsonCol<AffectedUser[]>(row['affected_users'], []),
    affectedVersions: parseJsonCol<string[]>(row['affected_versions'], []),
    firstOccurrence: row['first_occurrence'] as string,
    lastOccurrence: row['last_occurrence'] as string,
    resolved: row['resolved'] as boolean,
    resolvedBy: row['resolved_by'] as string | undefined,
    resolvedAt: row['resolved_at'] as string | undefined,
    resolutionNotes: row['resolution_notes'] as string | undefined,
    regressed: row['regressed'] as boolean,
    regressionCount: row['regression_count'] as number,
    expiresAt: row['expires_at'] as string | null,
  };
}

function parseJsonCol<T>(val: unknown, fallback: T): T {
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  if (val && typeof val === 'object') return val as T;
  return fallback;
}

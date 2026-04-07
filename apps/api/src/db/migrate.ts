/**
 * Lynx — Database Migrations
 * Run once at startup to ensure schema exists.
 */

import { query } from './pg.js';

export async function runMigrations(): Promise<void> {
  console.log('[lynx:db] Running migrations...');

  await query(`
    CREATE TABLE IF NOT EXISTS events (
      id            TEXT        PRIMARY KEY,
      timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      severity      TEXT        NOT NULL,
      layer         TEXT        NOT NULL,
      message       TEXT        NOT NULL,
      fingerprint   TEXT,
      project_id    TEXT,
      user_id       TEXT,
      user_email    TEXT,
      user_name     TEXT,
      environment   TEXT,
      version       TEXT,
      trace_id      TEXT,
      span_id       TEXT,
      expires_at    TIMESTAMPTZ,
      attributes    JSONB       NOT NULL DEFAULT '{}'
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS events_fingerprint_idx ON events (fingerprint)`);
  await query(`CREATE INDEX IF NOT EXISTS events_project_id_idx ON events (project_id)`);
  await query(`CREATE INDEX IF NOT EXISTS events_timestamp_idx ON events (timestamp DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS events_expires_at_idx ON events (expires_at) WHERE expires_at IS NOT NULL`);

  await query(`
    CREATE TABLE IF NOT EXISTS error_trackers (
      fingerprint         TEXT        PRIMARY KEY,
      error_name          TEXT        NOT NULL,
      layer               TEXT        NOT NULL,
      severity            TEXT        NOT NULL,
      project_id          TEXT,
      sample_message      TEXT        NOT NULL,
      occurrences         INTEGER     NOT NULL DEFAULT 1,
      affected_user_count INTEGER     NOT NULL DEFAULT 0,
      affected_users      JSONB       NOT NULL DEFAULT '[]',
      affected_versions   JSONB       NOT NULL DEFAULT '[]',
      first_occurrence    TIMESTAMPTZ NOT NULL,
      last_occurrence     TIMESTAMPTZ NOT NULL,
      resolved            BOOLEAN     NOT NULL DEFAULT false,
      resolved_by         TEXT,
      resolved_at         TIMESTAMPTZ,
      resolution_notes    TEXT,
      regressed           BOOLEAN     NOT NULL DEFAULT false,
      regression_count    INTEGER     NOT NULL DEFAULT 0,
      expires_at          TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS trackers_project_idx ON error_trackers (project_id)`);
  await query(`CREATE INDEX IF NOT EXISTS trackers_resolved_idx ON error_trackers (resolved)`);
  await query(`CREATE INDEX IF NOT EXISTS trackers_last_occ_idx ON error_trackers (last_occurrence DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS hitl_requests (
      id                TEXT        PRIMARY KEY,
      action            TEXT        NOT NULL DEFAULT 'CODE_CHANGE',
      title             TEXT        NOT NULL,
      description       TEXT        NOT NULL,
      thinking          TEXT,
      proposal          JSONB       NOT NULL DEFAULT '{}',
      context           JSONB       NOT NULL DEFAULT '{}',
      status            TEXT        NOT NULL DEFAULT 'PENDING',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at        TIMESTAMPTZ,
      approved_by       TEXT,
      approved_at       TIMESTAMPTZ,
      rejected_by       TEXT,
      rejected_at       TIMESTAMPTZ,
      rejection_reason  TEXT,
      modified_proposal TEXT
    )
  `);

  // Additive migration: add new columns if table already exists with old schema
  const addColIfMissing = async (col: string, def: string) => {
    try {
      await query(`ALTER TABLE hitl_requests ADD COLUMN IF NOT EXISTS ${col} ${def}`);
    } catch { /* ignore */ }
  };
  await addColIfMissing('action',            'TEXT NOT NULL DEFAULT \'CODE_CHANGE\'');
  await addColIfMissing('thinking',          'TEXT');
  await addColIfMissing('proposal',          'JSONB NOT NULL DEFAULT \'{}\'');
  await addColIfMissing('context',           'JSONB NOT NULL DEFAULT \'{}\'');
  await addColIfMissing('expires_at',        'TIMESTAMPTZ');
  await addColIfMissing('approved_by',       'TEXT');
  await addColIfMissing('approved_at',       'TIMESTAMPTZ');
  await addColIfMissing('rejected_by',       'TEXT');
  await addColIfMissing('rejected_at',       'TIMESTAMPTZ');
  await addColIfMissing('rejection_reason',  'TEXT');
  await addColIfMissing('modified_proposal', 'TEXT');

  await query(`CREATE INDEX IF NOT EXISTS hitl_status_idx ON hitl_requests (status)`);

  console.log('[lynx:db] Migrations complete');
}

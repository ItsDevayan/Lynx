/**
 * Lynx Monitor — Event Ingest
 *
 * Receives telemetry events from any instrumented application.
 * Compatible with LEMU's event format for zero-migration cost.
 * Also accepts OpenTelemetry attribute maps.
 *
 * Data flow:
 *   Event arrives → validate → generate fingerprint → upsert ErrorTracker → notify
 */

import { generateFingerprint, SEVERITY_LEVEL } from '@lynx/core';
import type { LynxEvent, Severity } from '@lynx/core';
import { upsertError, type ErrorTrackerStore } from './error-tracker.js';
import { notifyNewError } from './alerts.js';
import type { EventStore } from './storage.js';

export interface IngestResult {
  received: number;
  processed: number;
  errors: string[];
  newFingerprints: string[];
  regressions: string[];
}

export interface IngestDeps {
  eventStore: EventStore;
  errorTrackerStore: ErrorTrackerStore;
  projectId?: string;
}

/**
 * Ingest a batch of events.
 * Fingerprinting, dedup, and alerting happen per-event.
 */
export async function ingestEvents(
  events: LynxEvent[],
  deps: IngestDeps,
): Promise<IngestResult> {
  const result: IngestResult = {
    received: events.length,
    processed: 0,
    errors: [],
    newFingerprints: [],
    regressions: [],
  };

  const toStore: LynxEvent[] = [];

  for (const event of events) {
    try {
      const processed = processEvent(event, deps.projectId);
      toStore.push(processed);

      // Only track WARN+ in ErrorTracker (same as LEMU)
      if (SEVERITY_LEVEL[processed.severity] >= SEVERITY_LEVEL.WARN) {
        const { isNew, isRegression, tracker } = await upsertError(
          processed,
          deps.errorTrackerStore,
        );

        if (isNew || isRegression) {
          await notifyNewError(tracker, { isNew, isRegression });
        }

        if (isNew) result.newFingerprints.push(processed.fingerprint!);
        if (isRegression) result.regressions.push(processed.fingerprint!);
      }

      result.processed++;
    } catch (err) {
      result.errors.push(`Event processing failed: ${err}`);
    }
  }

  // Bulk insert all events
  if (toStore.length > 0) {
    await deps.eventStore.insertMany(toStore);
  }

  return result;
}

/**
 * Process a single event: validate, normalize, set fingerprint and expiry.
 */
function processEvent(event: LynxEvent, projectId?: string): LynxEvent {
  const severity = normalizeSeverity(event.severity);
  const now = new Date().toISOString();

  // Generate fingerprint if not provided
  const fingerprint = event.fingerprint
    ?? generateFingerprint(
      event.layer ?? 'SYSTEM',
      event.message ?? 'Unknown error',
    );

  // TTL: DEBUG/INFO → 14d, WARN → 30d, ERROR/FATAL → null (never)
  const expiresAt = computeExpiry(severity);

  return {
    ...event,
    id: event.id ?? crypto.randomUUID(),
    timestamp: event.timestamp ?? now,
    severity,
    layer: (event.layer ?? 'SYSTEM').toUpperCase(),
    message: event.message ?? '',
    fingerprint,
    projectId: event.projectId ?? projectId,
    expiresAt,
  };
}

function normalizeSeverity(s: unknown): Severity {
  if (typeof s === 'string') {
    const upper = s.toUpperCase() as Severity;
    if (['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'].includes(upper)) return upper;
  }
  if (typeof s === 'number') {
    const map: Record<number, Severity> = { 0: 'DEBUG', 1: 'INFO', 2: 'WARN', 3: 'ERROR', 4: 'FATAL' };
    return map[s] ?? 'INFO';
  }
  return 'INFO';
}

function computeExpiry(severity: Severity): string | null {
  const days: Partial<Record<Severity, number>> = {
    DEBUG: 14,
    INFO: 14,
    WARN: 30,
  };
  const d = days[severity];
  if (!d) return null; // ERROR/FATAL never expire until resolved
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toISOString();
}

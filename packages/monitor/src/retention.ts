/**
 * Lynx Monitor — Data Retention Service
 *
 * Scheduled cleanup of expired events and auto-resolution of stale errors.
 * Uses node-cron, runs in-process inside apps/api.
 *
 * Retention policy (matches TTL set at ingest time):
 *   DEBUG / INFO  → 14 days
 *   WARN          → 30 days
 *   ERROR / FATAL → never expire until resolved; after resolve → 30 days
 */

import cron from 'node-cron';
import type { EventStore } from './storage.js';
import type { ErrorTrackerStore } from './error-tracker.js';

export interface RetentionConfig {
  /** Cron schedule for event cleanup. Default: daily at 03:00 */
  eventCleanupSchedule?: string;
  /** Cron schedule for stale tracker resolution. Default: daily at 03:30 */
  trackerCleanupSchedule?: string;
  /** Resolve unresolved WARN trackers with no activity for this many days. Default: 90 */
  staleWarnDays?: number;
}

export class RetentionService {
  private tasks: cron.ScheduledTask[] = [];
  private eventStore: EventStore;
  private trackerStore: ErrorTrackerStore;
  private config: Required<RetentionConfig>;

  constructor(
    eventStore: EventStore,
    trackerStore: ErrorTrackerStore,
    config: RetentionConfig = {},
  ) {
    this.eventStore = eventStore;
    this.trackerStore = trackerStore;
    this.config = {
      eventCleanupSchedule: config.eventCleanupSchedule ?? '0 3 * * *',
      trackerCleanupSchedule: config.trackerCleanupSchedule ?? '30 3 * * *',
      staleWarnDays: config.staleWarnDays ?? 90,
    };
  }

  start(): void {
    // Clean expired events
    const eventTask = cron.schedule(this.config.eventCleanupSchedule, async () => {
      try {
        const deleted = await this.eventStore.deleteExpired();
        if (deleted > 0) {
          console.log(`[lynx:retention] Deleted ${deleted} expired events`);
        }
      } catch (err) {
        console.error('[lynx:retention] Event cleanup failed:', err);
      }
    });

    // Auto-resolve stale WARN trackers
    const trackerTask = cron.schedule(this.config.trackerCleanupSchedule, async () => {
      try {
        await this.resolveStaleTrackers();
      } catch (err) {
        console.error('[lynx:retention] Tracker cleanup failed:', err);
      }
    });

    this.tasks.push(eventTask, trackerTask);
  }

  stop(): void {
    for (const task of this.tasks) {
      task.stop();
    }
    this.tasks = [];
  }

  private async resolveStaleTrackers(): Promise<void> {
    const unresolved = await this.trackerStore.findUnresolved(undefined, 500);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.staleWarnDays);
    const cutoffIso = cutoff.toISOString();

    let count = 0;
    for (const tracker of unresolved) {
      // Only auto-resolve WARN — never auto-close ERROR/FATAL
      if (tracker.severity !== 'WARN') continue;
      if (tracker.lastOccurrence < cutoffIso) {
        await this.trackerStore.resolve(
          tracker.fingerprint,
          'lynx:retention',
          `Auto-resolved: no activity for ${this.config.staleWarnDays}+ days`,
        );
        count++;
      }
    }

    if (count > 0) {
      console.log(`[lynx:retention] Auto-resolved ${count} stale WARN trackers`);
    }
  }
}

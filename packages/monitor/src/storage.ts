/**
 * Lynx Monitor — Event Storage Interface
 *
 * EventStore is the persistence layer for raw telemetry events.
 * Apps provide their own implementation (PostgreSQL in apps/api).
 * The interface here keeps monitor package DB-agnostic.
 */

import type { LynxEvent } from '@lynx/core';

// ─── Interface ─────────────────────────────────────────────────────────────

export interface EventStore {
  insertMany(events: LynxEvent[]): Promise<void>;
  findByFingerprint(fingerprint: string, limit?: number): Promise<LynxEvent[]>;
  findRecent(projectId?: string, limit?: number): Promise<LynxEvent[]>;
  deleteExpired(): Promise<number>;
  countBySeverity(projectId?: string): Promise<Record<string, number>>;
}

// ─── In-Memory Implementation (for testing / lite mode without PG) ──────────

export class InMemoryEventStore implements EventStore {
  private events: LynxEvent[] = [];

  async insertMany(events: LynxEvent[]): Promise<void> {
    this.events.push(...events);
    // Keep last 10,000 events in memory
    if (this.events.length > 10_000) {
      this.events = this.events.slice(-10_000);
    }
  }

  async findByFingerprint(fingerprint: string, limit = 50): Promise<LynxEvent[]> {
    return this.events
      .filter((e) => e.fingerprint === fingerprint)
      .slice(-limit);
  }

  async findRecent(projectId?: string, limit = 100): Promise<LynxEvent[]> {
    let events = this.events;
    if (projectId) {
      events = events.filter((e) => e.projectId === projectId);
    }
    return events
      .slice(-limit)
      .sort((a, b) => {
        const ta = a.timestamp ?? '';
        const tb = b.timestamp ?? '';
        return tb.localeCompare(ta);
      });
  }

  async deleteExpired(): Promise<number> {
    const now = new Date().toISOString();
    const before = this.events.length;
    this.events = this.events.filter(
      (e) => !e.expiresAt || e.expiresAt > now,
    );
    return before - this.events.length;
  }

  async countBySeverity(projectId?: string): Promise<Record<string, number>> {
    let events = this.events;
    if (projectId) {
      events = events.filter((e) => e.projectId === projectId);
    }
    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.severity] = (counts[e.severity] ?? 0) + 1;
    }
    return counts;
  }

  /** Test helper — reset store */
  clear(): void {
    this.events = [];
  }

  /** Test helper — get all events */
  all(): LynxEvent[] {
    return [...this.events];
  }
}

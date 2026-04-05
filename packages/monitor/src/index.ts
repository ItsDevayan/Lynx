/**
 * @lynx/monitor — Public API
 *
 * Error tracking, dedup, fingerprinting, OTel ingest, APM.
 * Compatible with LEMU event format.
 */

// Ingest
export { ingestEvents, type IngestResult, type IngestDeps } from './ingest.js';

// Error Tracker
export {
  upsertError,
  type UpsertResult,
  type ErrorTrackerStore,
} from './error-tracker.js';

// Alerts
export { notifyNewError, type AlertContext } from './alerts.js';

// Storage
export { type EventStore, InMemoryEventStore } from './storage.js';

// Source Maps
export {
  loadSourceMap,
  unloadSourceMap,
  resolveStackTrace,
  formatResolvedStack,
  type OriginalPosition,
  type ResolvedFrame,
} from './source-map.js';

// Retention
export { RetentionService, type RetentionConfig } from './retention.js';

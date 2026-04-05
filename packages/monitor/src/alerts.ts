/**
 * Lynx Monitor — Alert Dispatcher
 *
 * Sends notifications for new errors and regressions via core/notifier.
 * Channel is configured by the user — Slack, Discord, email, or webhook.
 */

import { notifier } from '@lynx/core';
import type { ErrorTracker, Severity, NotificationPayload } from '@lynx/core';

type NotifSeverity = NotificationPayload['severity'];

function toNotifSeverity(s: Severity): NotifSeverity {
  const map: Record<Severity, NotifSeverity> = {
    DEBUG: 'info',
    INFO: 'info',
    WARN: 'warning',
    ERROR: 'error',
    FATAL: 'critical',
  };
  return map[s];
}

export interface AlertContext {
  isNew: boolean;
  isRegression: boolean;
}

export async function notifyNewError(
  tracker: ErrorTracker,
  ctx: AlertContext,
): Promise<void> {
  const badge = buildBadge(tracker, ctx);
  const title = `${badge} ${tracker.errorName}`;

  const lines = [
    `**Layer:** ${tracker.layer}`,
    `**Severity:** ${tracker.severity}`,
    `**Message:** ${truncate(tracker.sampleMessage, 200)}`,
    `**Occurrences:** ${tracker.occurrences}`,
    tracker.affectedUserCount > 0
      ? `**Affected Users:** ${tracker.affectedUserCount}`
      : null,
    tracker.affectedVersions.length > 0
      ? `**Versions:** ${tracker.affectedVersions.join(', ')}`
      : null,
    ctx.isRegression
      ? `**Regression #${tracker.regressionCount}** — previously resolved, came back`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  await notifier.alert(title, lines, toNotifSeverity(tracker.severity));
}

function buildBadge(tracker: ErrorTracker, ctx: AlertContext): string {
  if (ctx.isRegression) return `🔁 REGRESSED ×${tracker.regressionCount}`;
  if (ctx.isNew) return '🆕 NEW';
  return '🔔';
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

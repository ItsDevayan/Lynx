/**
 * Lynx — ANSI Terminal Colors
 * Used by CLI and log output. Same pattern as LEMU.
 */

export const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  // Colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  // Backgrounds
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
} as const;

// Lynx brand colors (for CLI headers)
export const brand = {
  purple: '\x1b[38;2;127;119;221m',   // #7F77DD
  teal: '\x1b[38;2;29;158;117m',      // #1D9E75
  coral: '\x1b[38;2;216;90;48m',      // #D85A30
  amber: '\x1b[38;2;186;117;23m',     // #BA7517
} as const;

import type { Severity } from './types.js';

export function severityColor(severity: Severity): string {
  const map: Record<Severity, string> = {
    DEBUG: c.gray,
    INFO: c.blue,
    WARN: c.yellow,
    ERROR: c.red,
    FATAL: c.bgRed + c.white,
  };
  return map[severity] ?? c.reset;
}

export function severityIcon(severity: Severity): string {
  const map: Record<Severity, string> = {
    DEBUG: '🔵',
    INFO: 'ℹ️ ',
    WARN: '⚠️ ',
    ERROR: '🔴',
    FATAL: '💀',
  };
  return map[severity] ?? '  ';
}

export function drawBox(title: string, lines: string[], width = 60): string {
  const top = `┌${'─'.repeat(width - 2)}┐`;
  const bottom = `└${'─'.repeat(width - 2)}┘`;
  const mid = (text: string) => {
    const padded = ` ${text}`.padEnd(width - 2);
    return `│${padded}│`;
  };
  const titleLine = mid(`${c.bold}${title}${c.reset}`);
  const separator = `├${'─'.repeat(width - 2)}┤`;
  return [top, titleLine, separator, ...lines.map(mid), bottom].join('\n');
}

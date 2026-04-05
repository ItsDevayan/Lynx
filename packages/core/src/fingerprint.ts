/**
 * Lynx — Error Fingerprinting
 *
 * Generates stable fingerprints for error deduplication.
 * Pattern: {LAYER}::{ErrorName}::{NormalizedMessage}
 *
 * Inspired by LEMU's battle-tested approach, rewritten as a generic utility.
 */

// ─── Normalization Rules ──────────────────────────────────────────────────────

const NORMALIZATIONS: Array<[RegExp, string]> = [
  // MongoDB / UUID / hex IDs (24-char hex, UUIDs)
  [/\b[0-9a-f]{24}\b/gi, '<ID>'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<UUID>'],
  // ISO timestamps
  [/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g, '<TS>'],
  // Unix timestamps (10-13 digits)
  [/\b\d{10,13}\b/g, '<TS>'],
  // URLs (must come before general numbers)
  [/https?:\/\/[^\s"')\]]+/g, '<URL>'],
  // IP addresses
  [/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?\b/g, '<IP>'],
  // Large numbers (>= 4 digits, often timings, IDs, ports)
  [/\b\d{4,}\b/g, '<NUM>'],
  // File paths with dynamic segments (e.g. /users/john/file.txt)
  [/(?:\/[\w.-]+){3,}/g, '<PATH>'],
  // Quoted strings (often dynamic values in error messages)
  [/"[^"]{20,}"/g, '"<STR>"'],
  [/'[^']{20,}'/g, "'<STR>'"],
  // Email addresses
  [/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi, '<EMAIL>'],
];

/**
 * Normalize a message to remove dynamic content (IDs, timestamps, etc.)
 * so the same error type always generates the same fingerprint.
 */
export function normalizeMessage(message: string): string {
  let normalized = message;
  for (const [pattern, replacement] of NORMALIZATIONS) {
    normalized = normalized.replace(pattern, replacement);
  }
  // Collapse multiple spaces and trim
  return normalized.replace(/\s+/g, ' ').trim().substring(0, 200);
}

/**
 * Extract the error name from an error message or Error object string.
 * e.g. "TypeError: Cannot read property 'x' of undefined" → "TypeError"
 */
export function extractErrorName(message: string, errorName?: string): string {
  if (errorName && errorName !== 'Error') return errorName;

  const match = message.match(/^([A-Za-z]+Error|[A-Za-z]+Exception|[A-Za-z]+Fault):/);
  if (match) return match[1];

  // Check common patterns
  if (message.includes('ECONNREFUSED')) return 'ConnectionRefusedError';
  if (message.includes('ETIMEDOUT')) return 'TimeoutError';
  if (message.includes('ENOTFOUND')) return 'DNSError';
  if (message.includes('EACCES')) return 'PermissionError';
  if (message.includes('ENOENT')) return 'FileNotFoundError';
  if (message.includes('JSON')) return 'JSONError';
  if (message.includes('401') || message.includes('Unauthorized')) return 'AuthError';
  if (message.includes('403') || message.includes('Forbidden')) return 'ForbiddenError';
  if (message.includes('404')) return 'NotFoundError';
  if (message.includes('500')) return 'ServerError';
  if (message.includes('timeout') || message.includes('Timeout')) return 'TimeoutError';

  return 'Error';
}

/**
 * Generate a stable fingerprint for deduplication.
 *
 * Format: {LAYER}::{ErrorName}::{NormalizedMessage}
 */
export function generateFingerprint(
  layer: string,
  message: string,
  errorName?: string,
): string {
  const name = extractErrorName(message, errorName);
  const normalized = normalizeMessage(message);
  return `${layer.toUpperCase()}::${name}::${normalized}`;
}

/**
 * Check if two events are likely the same error based on fingerprint similarity.
 * Useful for fuzzy matching when exact fingerprint doesn't match.
 */
export function fingerprintsAreSimilar(fp1: string, fp2: string): boolean {
  const [layer1, name1] = fp1.split('::');
  const [layer2, name2] = fp2.split('::');
  return layer1 === layer2 && name1 === name2;
}

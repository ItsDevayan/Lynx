/**
 * Lynx Monitor — Source Map Resolution
 *
 * Resolves minified stack traces back to original source locations.
 * Maps are cached in memory with LRU-style eviction.
 *
 * Port of LEMU's SourceMapService, generalized to any JS app.
 */

import { SourceMapConsumer } from 'source-map';

export interface OriginalPosition {
  source: string | null;
  line: number | null;
  column: number | null;
  name: string | null;
}

export interface ResolvedFrame {
  raw: string;
  file: string;
  line: number;
  column: number;
  original?: OriginalPosition;
}

// ─── Source Map Cache ────────────────────────────────────────────────────────

const MAP_CACHE = new Map<string, SourceMapConsumer>();
const MAX_CACHE = 50;

function evictIfNeeded(): void {
  if (MAP_CACHE.size >= MAX_CACHE) {
    const firstKey = MAP_CACHE.keys().next().value;
    if (firstKey) {
      const consumer = MAP_CACHE.get(firstKey);
      consumer?.destroy();
      MAP_CACHE.delete(firstKey);
    }
  }
}

export async function loadSourceMap(
  mapKey: string,
  rawMap: string | object,
): Promise<void> {
  evictIfNeeded();
  const consumer = await new SourceMapConsumer(rawMap as string);
  MAP_CACHE.set(mapKey, consumer);
}

export function unloadSourceMap(mapKey: string): void {
  const consumer = MAP_CACHE.get(mapKey);
  consumer?.destroy();
  MAP_CACHE.delete(mapKey);
}

// ─── Stack Frame Parser ──────────────────────────────────────────────────────

const FRAME_RE = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/;

function parseFrame(line: string): { file: string; lineNo: number; col: number; fn?: string } | null {
  const m = FRAME_RE.exec(line);
  if (!m) return null;
  return {
    fn: m[1] ?? undefined,
    file: m[2],
    lineNo: parseInt(m[3], 10),
    col: parseInt(m[4], 10),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve all frames in a stack trace string.
 * Falls back to raw frame data if no source map is loaded for the file.
 */
export async function resolveStackTrace(
  stackTrace: string,
  mapKey?: string,
): Promise<ResolvedFrame[]> {
  const lines = stackTrace.split('\n');
  const frames: ResolvedFrame[] = [];

  const consumer = mapKey ? MAP_CACHE.get(mapKey) : undefined;

  for (const line of lines) {
    const parsed = parseFrame(line);
    if (!parsed) continue;

    const frame: ResolvedFrame = {
      raw: line.trim(),
      file: parsed.file,
      line: parsed.lineNo,
      column: parsed.col,
    };

    if (consumer) {
      const pos = consumer.originalPositionFor({
        line: parsed.lineNo,
        column: parsed.col,
      });
      if (pos.source) {
        frame.original = {
          source: pos.source,
          line: pos.line,
          column: pos.column,
          name: pos.name,
        };
      }
    }

    frames.push(frame);
  }

  return frames;
}

/**
 * Format resolved frames back into a readable stack trace string.
 */
export function formatResolvedStack(frames: ResolvedFrame[]): string {
  return frames
    .map((f) => {
      if (f.original?.source) {
        const loc = `${f.original.source}:${f.original.line}:${f.original.column}`;
        const name = f.original.name ? `${f.original.name} ` : '';
        return `  at ${name}(${loc})`;
      }
      return `  at (${f.file}:${f.line}:${f.column})`;
    })
    .join('\n');
}

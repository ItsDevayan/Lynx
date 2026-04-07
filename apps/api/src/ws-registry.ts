/**
 * Shared WebSocket client registry.
 * Import `wsClients` anywhere in the API to broadcast to all connected dashboard tabs.
 */

import type { WebSocket } from '@fastify/websocket';

export const wsClients = new Set<WebSocket>();

export function broadcast(payload: unknown): void {
  if (wsClients.size === 0) return;
  const msg = JSON.stringify(payload);
  for (const client of wsClients) {
    try {
      if (client.readyState === 1 /* OPEN */) {
        client.send(msg);
      }
    } catch { /* ignore dead socket */ }
  }
}

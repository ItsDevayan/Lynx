/**
 * Lynx — Breadcrumb Trail
 * Keeps the last N actions as context for error debugging.
 * Same 50-item ring buffer as LEMU, rebuilt as a generic utility.
 */

import type { Breadcrumb } from './types.js';

const MAX_BREADCRUMBS = 50;

export class BreadcrumbTrail {
  private items: Breadcrumb[] = [];

  add(crumb: Omit<Breadcrumb, 'timestamp'>): void {
    const full: Breadcrumb = { ...crumb, timestamp: new Date().toISOString() };
    this.items.push(full);
    if (this.items.length > MAX_BREADCRUMBS) {
      this.items.shift();
    }
  }

  get(): Breadcrumb[] {
    return [...this.items];
  }

  clear(): void {
    this.items = [];
  }

  /** Flush and return all breadcrumbs, clearing the buffer */
  flush(): Breadcrumb[] {
    const crumbs = this.get();
    this.clear();
    return crumbs;
  }
}

/** Global breadcrumb trail for the current process */
export const globalTrail = new BreadcrumbTrail();

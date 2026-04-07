/**
 * Notification Center — slide-out panel subscribed to lynx:ws events
 *
 * Shows: new errors, HITL requests, agent completions, security findings.
 * Bell icon with unread count lives in the Sidebar bottom section.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

export interface Notification {
  id: string;
  type: 'error' | 'hitl' | 'agent' | 'security' | 'info';
  title: string;
  detail?: string;
  ts: Date;
  read: boolean;
  link?: string; // route to navigate to
}

const TYPE_ICON: Record<Notification['type'], string> = {
  error:    '⚠',
  hitl:     '◇',
  agent:    '◈',
  security: '⬡',
  info:     '◦',
};

const TYPE_COLOR: Record<Notification['type'], string> = {
  error:    'var(--red)',
  hitl:     'var(--amber)',
  agent:    'var(--purple-hi)',
  security: 'var(--red)',
  info:     'var(--text-dim)',
};

let _listeners: Array<(n: Notification) => void> = [];

/** Call this from anywhere to push a notification programmatically */
export function pushNotification(n: Omit<Notification, 'id' | 'ts' | 'read'>) {
  const full: Notification = { ...n, id: `n-${Date.now()}`, ts: new Date(), read: false };
  _listeners.forEach(l => l(full));
}

export function NotificationBell({ onClick, unread }: { onClick: () => void; unread: number }) {
  return (
    <button
      onClick={onClick}
      className="relative flex items-center justify-center w-6 h-6 transition-opacity hover:opacity-80"
      title="Notifications"
    >
      <span className="font-mono text-xs" style={{ color: 'var(--text-mute)' }}>🔔</span>
      {unread > 0 && (
        <span
          className="absolute -top-1 -right-1 font-mono rounded-full flex items-center justify-center"
          style={{ background: 'var(--red)', color: '#fff', fontSize: 9, minWidth: 14, height: 14, padding: '0 3px' }}
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}

export function NotificationCenter({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const addedRef = useRef(new Set<string>());

  // Subscribe to WS events and convert to notifications
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (!msg?.type) return;

      let n: Omit<Notification, 'id' | 'ts' | 'read'> | null = null;

      if (msg.type === 'error:new') {
        n = {
          type: 'error',
          title: `${msg.data?.newErrors ?? 1} new error(s) ingested`,
          detail: msg.data?.projectId ? `project: ${msg.data.projectId}` : undefined,
          link: '/monitor',
        };
      } else if (msg.type === 'hitl:created') {
        n = {
          type: 'hitl',
          title: `Approval required: ${msg.data?.title ?? 'code change'}`,
          link: '/approvals',
        };
      } else if (msg.type === 'hitl:applied') {
        n = {
          type: 'info',
          title: `Change approved`,
          detail: msg.data?.id?.slice(-8),
        };
      } else if (msg.type === 'hitl:rejected') {
        n = {
          type: 'info',
          title: `Change rejected`,
          detail: msg.data?.id?.slice(-8),
        };
      }

      if (n) pushNotification(n);
    };
    window.addEventListener('lynx:ws', handler);
    return () => window.removeEventListener('lynx:ws', handler);
  }, []);

  // Subscribe to programmatic pushes
  useEffect(() => {
    const listener = (n: Notification) => {
      if (addedRef.current.has(n.id)) return;
      addedRef.current.add(n.id);
      setNotifications(prev => [n, ...prev].slice(0, 50));
    };
    _listeners.push(listener);
    return () => { _listeners = _listeners.filter(l => l !== listener); };
  }, []);

  const unread = notifications.filter(n => !n.read).length;

  const markAllRead = () =>
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));

  const clearAll = () => {
    setNotifications([]);
    addedRef.current.clear();
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={onClose}
            />
            {/* Panel */}
            <motion.div
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed left-[200px] top-0 bottom-0 z-50 flex flex-col"
              style={{
                width: 300,
                background: 'var(--surface)',
                borderRight: '1px solid var(--border)',
                boxShadow: '4px 0 24px rgba(0,0,0,0.3)',
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <div>
                  <p className="text-xs font-semibold">notifications</p>
                  <p className="text-xs font-mono" style={{ color: 'var(--text-mute)', fontSize: 10 }}>
                    {unread > 0 ? `${unread} unread` : 'all caught up'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {unread > 0 && (
                    <button onClick={markAllRead} className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>
                      mark read
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button onClick={clearAll} className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>
                      clear
                    </button>
                  )}
                  <button onClick={onClose} className="font-mono text-xs" style={{ color: 'var(--text-mute)' }}>✕</button>
                </div>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="text-center py-16">
                    <p className="font-mono text-2xl mb-2" style={{ color: 'var(--text-mute)' }}>◦</p>
                    <p className="text-xs" style={{ color: 'var(--text-mute)' }}>no notifications yet</p>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {notifications.map(n => (
                      <motion.div
                        key={n.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-all"
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: n.read ? 'transparent' : 'var(--overlay)',
                        }}
                        onClick={() => {
                          setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
                          if (n.link) { onNavigate(n.link); onClose(); }
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--overlay)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = n.read ? 'transparent' : 'var(--overlay)'}
                      >
                        <span className="font-mono text-xs flex-shrink-0 mt-0.5" style={{ color: TYPE_COLOR[n.type] }}>
                          {TYPE_ICON[n.type]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold leading-tight" style={{ color: n.read ? 'var(--text-dim)' : 'var(--text)' }}>
                            {n.title}
                          </p>
                          {n.detail && (
                            <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-mute)', fontSize: 10 }}>
                              {n.detail}
                            </p>
                          )}
                          <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-mute)', fontSize: 10 }}>
                            {formatDistanceToNow(n.ts, { addSuffix: true })}
                          </p>
                        </div>
                        {!n.read && (
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: TYPE_COLOR[n.type] }} />
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/** Hook to get unread count from the shared notification state */
export function useUnreadCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const listener = (n: Notification) => {
      if (!n.read) setCount(c => c + 1);
    };
    _listeners.push(listener);
    return () => { _listeners = _listeners.filter(l => l !== listener); };
  }, []);
  return count;
}

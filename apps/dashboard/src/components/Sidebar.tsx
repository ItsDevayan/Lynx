/**
 * Lynx Sidebar — terminal-native nav
 * VS Code-style: icon + label, active indicator, bottom status
 */

import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const NAV = [
  { to: '/',          icon: '⬡',  label: 'overview',     shortcut: '1' },
  { to: '/tests',     icon: '⚗',  label: 'tests',        shortcut: '2' },
  { to: '/security',  icon: '⬡',  label: 'security',     shortcut: '3' },
  { to: '/monitor',   icon: '◎',  label: 'monitor',      shortcut: '4' },
  { to: '/brain',     icon: '◈',  label: 'brain',        shortcut: '5' },
  { to: '/scout',     icon: '◉',  label: 'scout',        shortcut: '6' },
  { to: '/approvals',    icon: '◇',  label: 'approvals',    shortcut: '7' },
  { to: '/integrations', icon: '⬡',  label: 'integrations', shortcut: '8' },
  { to: '/memory',    icon: '◎',  label: 'memory',       shortcut: '' },
];

const BOTTOM_NAV = [
  { to: '/settings', icon: '⚙', label: 'settings' },
];

const PROVIDER_LABEL: Record<string, string> = {
  groq:        'groq',
  'claude-api': 'claude api',
  'claude-cli': 'claude cli',
  openai:      'openai',
  gemini:      'gemini',
  aider:       'aider',
  codex:       'codex',
  'gemini-cli': 'gemini cli',
  none:        'no ai',
  skip:        'no ai',
  ollama:      'ollama',
};

interface SidebarProps {
  projectPath?: string;
  llmMode?: string;
  theme?: 'dark' | 'light';
  toggleTheme?: () => void;
  notifUnread?: number;
  onNotifOpen?: () => void;
}

interface MeshStatus {
  active: boolean;
  bundleName: string;
  ram: number;
  parallel: boolean;
}

export function Sidebar({ projectPath, llmMode, theme, toggleTheme, notifUnread = 0, onNotifOpen }: SidebarProps) {
  const location = useLocation();
  const qc = useQueryClient();
  const projectName = projectPath
    ? projectPath.split('/').filter(Boolean).pop() ?? projectPath
    : null;

  // Poll mesh status every 30s
  const mesh = useQuery<MeshStatus>({
    queryKey: ['mesh-status-sidebar'],
    queryFn: () => fetch('/api/mesh/status').then(r => r.json()),
    refetchInterval: 30_000,
    retry: false,
  });

  // Pending approvals count — live via WS
  const hitl = useQuery<{ count: number }>({
    queryKey: ['hitl-count'],
    queryFn: () => fetch('/api/hitl').then(r => r.json()).then(d => ({ count: d.count ?? 0 })),
    refetchInterval: 30_000,
    retry: false,
  });

  // Re-fetch approvals count when HITL events arrive over WS
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (msg?.type === 'hitl:created' || msg?.type === 'hitl:applied') {
        qc.invalidateQueries({ queryKey: ['hitl-count'] });
      }
    };
    window.addEventListener('lynx:ws', handler);
    return () => window.removeEventListener('lynx:ws', handler);
  }, [qc]);

  const orchestratorLabel = llmMode ? (PROVIDER_LABEL[llmMode] ?? llmMode) : 'no ai';
  const aiActive = !!llmMode && llmMode !== 'skip' && llmMode !== 'none';
  const meshActive = mesh.data?.active ?? false;
  const pendingApprovals = (hitl.data as any)?.count ?? 0;

  return (
    <aside
      className="flex flex-col"
      style={{
        width: 200,
        minWidth: 200,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Logo / project */}
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, var(--purple), var(--teal))',
              boxShadow: '0 0 10px rgba(124,111,205,0.35)',
            }}
          >
            <span className="text-white font-bold text-xs font-mono">L</span>
          </div>
          <span className="font-semibold text-xs" style={{ color: 'var(--text)' }}>lynx</span>
          <span
            className="ml-auto text-xs font-mono px-1 rounded"
            style={{ background: 'var(--surface2)', color: 'var(--text-dim)', fontSize: 10 }}
          >
            v0.1
          </span>
        </div>

        {projectName ? (
          <div className="flex items-center gap-1.5 mt-1">
            <span style={{ color: 'var(--teal)', fontSize: 10 }}>◉</span>
            <span
              className="text-xs font-mono truncate"
              style={{ color: 'var(--teal)', maxWidth: 140 }}
              title={projectPath}
            >
              {projectName}
            </span>
          </div>
        ) : (
          <NavLink
            to="/settings"
            className="flex items-center gap-1.5 mt-1 hover:opacity-80 transition-opacity"
          >
            <span style={{ color: 'var(--text-mute)', fontSize: 10 }}>○</span>
            <span className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>no project</span>
          </NavLink>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV.map(({ to, icon, label, shortcut }) => {
          const isActive = to === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(to);

          return (
            <NavLink key={to} to={to} end={to === '/'} className="block relative">
              <div
                className="flex items-center gap-2.5 px-4 py-2 transition-all duration-100"
                style={{
                  color: isActive ? 'var(--text)' : 'var(--text-dim)',
                  background: isActive ? 'var(--overlay)' : 'transparent',
                }}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-bar"
                    className="absolute left-0 top-0 bottom-0 w-0.5"
                    style={{ background: 'var(--purple)' }}
                  />
                )}
                <span
                  className="font-mono text-xs w-4 text-center flex-shrink-0"
                  style={{ color: isActive ? 'var(--purple-hi)' : 'var(--text-mute)' }}
                >
                  {icon}
                </span>
                <span className="text-xs flex-1">{label}</span>
                {/* brain badge: show "mesh" when active */}
                {to === '/brain' && meshActive && (
                  <span
                    className="font-mono text-xs px-1 rounded"
                    style={{ background: 'var(--teal-lo)', color: 'var(--teal)', fontSize: 9 }}
                  >
                    mesh
                  </span>
                )}
                {/* approvals badge: pending count */}
                {to === '/approvals' && pendingApprovals > 0 && (
                  <span
                    className="font-mono text-xs px-1.5 rounded-full"
                    style={{ background: 'var(--amber-lo)', color: 'var(--amber)', fontSize: 9, border: '1px solid rgba(212,160,23,0.4)', minWidth: 16, textAlign: 'center' }}
                  >
                    {pendingApprovals}
                  </span>
                )}
                <span
                  className="font-mono opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ fontSize: 10, color: 'var(--text-mute)' }}
                >
                  ⌥{shortcut}
                </span>
              </div>
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom */}
      <div style={{ borderTop: '1px solid var(--border)' }}>
        {/* Utility row: notifications + theme toggle */}
        <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid var(--border-dim)' }}>
          {/* Notification bell */}
          <button
            onClick={onNotifOpen}
            className="relative flex items-center gap-1 text-xs font-mono transition-opacity hover:opacity-80 flex-1"
            style={{ color: 'var(--text-mute)' }}
            title="Notifications (Alt+N)"
          >
            <span>🔔</span>
            {notifUnread > 0 && (
              <span
                className="rounded-full font-mono"
                style={{ background: 'var(--red)', color: '#fff', fontSize: 9, padding: '1px 4px' }}
              >
                {notifUnread > 9 ? '9+' : notifUnread}
              </span>
            )}
            <span style={{ fontSize: 10 }}>notifs</span>
          </button>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="font-mono text-xs px-1.5 py-0.5 rounded transition-all hover:opacity-80"
            style={{ color: 'var(--text-mute)', background: 'var(--surface2)', border: '1px solid var(--border)' }}
            title="Toggle theme"
          >
            {theme === 'dark' ? '☀' : '🌙'}
          </button>
        </div>

        {BOTTOM_NAV.map(({ to, icon, label }) => (
          <NavLink key={to} to={to} className="block">
            {({ isActive }) => (
              <div
                className="flex items-center gap-2.5 px-4 py-2.5 text-xs transition-all"
                style={{ color: isActive ? 'var(--text)' : 'var(--text-dim)' }}
              >
                <span className="font-mono w-4 text-center" style={{ color: 'var(--text-mute)' }}>{icon}</span>
                {label}
              </div>
            )}
          </NavLink>
        ))}

        {/* Two-tier AI indicator */}
        <div
          className="px-3 py-2.5 space-y-1.5"
          style={{ borderTop: '1px solid var(--border-dim)' }}
        >
          {/* Orchestrator row */}
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: aiActive ? 'var(--purple-hi)' : 'var(--text-mute)' }}
            />
            <span className="text-xs font-mono truncate" style={{ color: aiActive ? 'var(--purple-hi)' : 'var(--text-mute)', fontSize: 10 }}>
              {orchestratorLabel}
            </span>
            <span className="ml-auto text-xs font-mono" style={{ color: 'var(--text-mute)', fontSize: 9 }}>orch</span>
          </div>

          {/* Executor / mesh row */}
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meshActive ? 'pulse-dot' : ''}`}
              style={{ background: meshActive ? 'var(--teal)' : 'var(--text-mute)', width: 6, height: 6 }}
            />
            <span className="text-xs font-mono truncate" style={{ color: meshActive ? 'var(--teal)' : 'var(--text-mute)', fontSize: 10 }}>
              {mesh.data ? mesh.data.bundleName.toLowerCase() : 'ollama'}
            </span>
            <span className="ml-auto text-xs font-mono" style={{ color: 'var(--text-mute)', fontSize: 9 }}>exec</span>
          </div>

          {/* RAM + parallel badge */}
          {mesh.data && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="font-mono" style={{ color: 'var(--text-mute)', fontSize: 9 }}>
                {mesh.data.ram}GB
              </span>
              {mesh.data.parallel && (
                <span
                  className="font-mono px-1 rounded"
                  style={{ background: 'var(--teal-lo)', color: 'var(--teal)', fontSize: 9 }}
                >
                  ∥ parallel
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

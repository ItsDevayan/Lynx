/**
 * Lynx Sidebar — terminal-native nav
 * VS Code-style: icon + label, active indicator, bottom status bar items
 */

import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

const NAV = [
  { to: '/',          icon: '⬡',  label: 'overview',  shortcut: '1' },
  { to: '/tests',     icon: '⚗',  label: 'tests',     shortcut: '2' },
  { to: '/security',  icon: '⬡',  label: 'security',  shortcut: '3' },
  { to: '/monitor',   icon: '◎',  label: 'monitor',   shortcut: '4' },
  { to: '/brain',     icon: '◈',  label: 'brain',     shortcut: '5' },
  { to: '/scout',     icon: '◉',  label: 'scout',     shortcut: '6' },
  { to: '/approvals', icon: '◇',  label: 'approvals', shortcut: '7' },
];

const BOTTOM_NAV = [
  { to: '/settings', icon: '⚙', label: 'settings' },
];

interface SidebarProps {
  projectPath?: string;
  llmMode?: string;
}

export function Sidebar({ projectPath, llmMode }: SidebarProps) {
  const location = useLocation();
  const projectName = projectPath
    ? projectPath.split('/').filter(Boolean).pop() ?? projectPath
    : null;

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
      <div
        className="px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
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
            <span className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>
              no project
            </span>
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
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className="block relative"
            >
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

        {/* LLM indicator */}
        <div
          className="px-4 py-2 flex items-center gap-2"
          style={{ borderTop: '1px solid var(--border-dim)' }}
        >
          <span
            className="pulse-dot"
            style={{ background: llmMode && llmMode !== 'skip' ? 'var(--teal)' : 'var(--text-mute)' }}
          />
          <span className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>
            {llmMode === 'groq' ? 'groq / llama3' : llmMode === 'ollama' ? 'ollama' : llmMode === 'claude-cli' ? 'claude cli' : 'no ai'}
          </span>
        </div>
      </div>
    </aside>
  );
}

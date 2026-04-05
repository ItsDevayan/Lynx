/**
 * Lynx App — Root component
 *
 * Flow:
 *   1. Boot screen (cinematic, ~4s)
 *   2. If no setup → Onboarding wizard
 *   3. Main app (sidebar + routes)
 */

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

import { BootScreen } from './components/BootScreen.tsx';
import { Onboarding } from './components/Onboarding.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { OverviewPage } from './pages/Overview.tsx';
import { MonitorPage } from './pages/Monitor.tsx';
import { ApprovalsPage } from './pages/Approvals.tsx';
import { BrainPage } from './pages/Brain.tsx';
import { TestsPage, SecurityPage, ScoutPage } from './pages/Placeholder.tsx';

const BOOT_DONE_KEY = 'lynx_booted';
const SETUP_DONE_KEY = 'lynx_setup_complete';

interface LynxConfig {
  projectPath?: string;
  llm?: { mode: string };
}

function getStoredConfig(): LynxConfig | null {
  try {
    const s = localStorage.getItem('lynx_config');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export default function App() {
  const [phase, setPhase] = useState<'boot' | 'onboarding' | 'app'>('boot');
  const [firstRun] = useState(() => !sessionStorage.getItem(BOOT_DONE_KEY));
  const [config, setConfig] = useState<LynxConfig | null>(getStoredConfig);

  const onBootDone = () => {
    sessionStorage.setItem(BOOT_DONE_KEY, '1');
    const setupDone = localStorage.getItem(SETUP_DONE_KEY);
    setPhase(setupDone ? 'app' : 'onboarding');
  };

  const onSetupDone = (cfg: LynxConfig) => {
    setConfig(cfg);
    setPhase('app');
  };

  // WebSocket — real-time push (only when app is ready)
  useEffect(() => {
    if (phase !== 'app') return;

    const ws = new WebSocket(`ws://${window.location.host}/ws`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'hitl:created') {
          console.log('[lynx:ws] HITL request pending:', msg.data?.title);
        }
      } catch { /* ignore */ }
    };
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
    }, 30_000);
    return () => { clearInterval(ping); ws.close(); };
  }, [phase]);

  return (
    <AnimatePresence mode="wait">
      {phase === 'boot' && (
        <BootScreen
          key="boot"
          onComplete={onBootDone}
          isFirstRun={firstRun}
        />
      )}

      {phase === 'onboarding' && (
        <motion.div
          key="onboarding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Onboarding onComplete={onSetupDone} />
        </motion.div>
      )}

      {phase === 'app' && (
        <motion.div
          key="app"
          className="flex h-screen overflow-hidden"
          style={{ background: 'var(--bg)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <BrowserRouter>
            {/* Sidebar */}
            <Sidebar
              projectPath={config?.projectPath}
              llmMode={config?.llm?.mode}
            />

            {/* Main content */}
            <div className="flex flex-col flex-1 overflow-hidden">
              <main className="flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
                <Routes>
                  <Route path="/"          element={<OverviewPage />} />
                  <Route path="/tests"     element={<TestsPage />} />
                  <Route path="/security"  element={<SecurityPage />} />
                  <Route path="/monitor"   element={<MonitorPage />} />
                  <Route path="/brain"     element={<BrainPage />} />
                  <Route path="/scout"     element={<ScoutPage />} />
                  <Route path="/approvals" element={<ApprovalsPage />} />
                  <Route path="/settings"  element={<SettingsPage config={config} />} />
                </Routes>
              </main>

              {/* Status bar */}
              <div className="statusbar flex-shrink-0">
                <span className="statusbar-item">
                  <span
                    className="pulse-dot"
                    style={{ background: 'var(--teal)', width: 5, height: 5 }}
                  />
                  api:4000
                </span>
                {config?.projectPath && (
                  <span className="statusbar-item" style={{ color: 'var(--text-mute)' }}>
                    {config.projectPath.split('/').filter(Boolean).pop()}
                  </span>
                )}
                {config?.llm?.mode && config.llm.mode !== 'skip' && (
                  <span className="statusbar-item" style={{ color: 'var(--text-mute)' }}>
                    ai:{config.llm.mode}
                  </span>
                )}
                <span className="ml-auto statusbar-item" style={{ color: 'var(--text-mute)' }}>
                  lynx v0.1
                </span>
              </div>
            </div>
          </BrowserRouter>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Settings page (inline) ───────────────────────────────────────────────────

function SettingsPage({ config }: { config: LynxConfig | null }) {
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-base font-semibold mb-1">Settings</h1>
      <p className="text-xs mb-6" style={{ color: 'var(--text-dim)' }}>Project and AI configuration</p>

      <div className="rounded p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="section-title mb-3">current config</p>
        <pre className="text-xs overflow-auto" style={{ color: 'var(--text-dim)' }}>
          {JSON.stringify(config, null, 2)}
        </pre>
      </div>

      <button
        className="btn btn-ghost text-xs"
        onClick={() => {
          localStorage.removeItem('lynx_setup_complete');
          localStorage.removeItem('lynx_config');
          window.location.reload();
        }}
      >
        ← Re-run setup wizard
      </button>
    </div>
  );
}

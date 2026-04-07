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
import { Provisioning } from './components/Provisioning.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { OverviewPage } from './pages/Overview.tsx';
import { MonitorPage } from './pages/Monitor.tsx';
import { ApprovalsPage } from './pages/Approvals.tsx';
import { BrainPage } from './pages/Brain.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { TestsPage } from './pages/Tests.tsx';
import { SecurityPage } from './pages/Security.tsx';
import { ScoutPage } from './pages/Scout.tsx';
import { LynxLanding } from './pages/LynxLanding.tsx';
import { IntegrationsPage } from './pages/Integrations.tsx';

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
  const [phase, setPhase] = useState<'boot' | 'landing' | 'onboarding' | 'provisioning' | 'app'>('boot');
  const [firstRun] = useState(() => !sessionStorage.getItem(BOOT_DONE_KEY));
  const [config, setConfig] = useState<LynxConfig | null>(getStoredConfig);

  const onBootDone = () => {
    sessionStorage.setItem(BOOT_DONE_KEY, '1');
    const setupDone = localStorage.getItem(SETUP_DONE_KEY);
    // New users see the landing page first, returning users go straight to app
    setPhase(setupDone ? 'app' : 'landing');
  };

  const onSetupDone = (cfg: LynxConfig) => {
    setConfig(cfg);
    setPhase('provisioning');
  };

  // Live config updates from Settings page — no reload needed
  useEffect(() => {
    const handler = (e: Event) => {
      const updated = (e as CustomEvent<LynxConfig>).detail;
      if (updated) setConfig(updated);
    };
    window.addEventListener('lynx:config-changed', handler);
    return () => window.removeEventListener('lynx:config-changed', handler);
  }, []);

  // WebSocket — real-time push (only when app is ready)
  useEffect(() => {
    if (phase !== 'app') return;

    const ws = new WebSocket(`ws://${window.location.host}/ws`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'hitl:created') {
          console.log('[lynx:ws] HITL request pending:', msg.data?.title);
          // Route user to approvals via custom event
        }
        // Broadcast WS events to page-level listeners via custom DOM events
        window.dispatchEvent(new CustomEvent('lynx:ws', { detail: msg }));
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

      {phase === 'landing' && (
        <motion.div
          key="landing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          style={{ height: '100vh', overflowY: 'auto' }}
        >
          <LynxLanding onStart={() => setPhase('onboarding')} />
        </motion.div>
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

      {phase === 'provisioning' && (
        <motion.div
          key="provisioning"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Provisioning
            config={config ?? {}}
            onDone={() => setPhase('app')}
          />
        </motion.div>
      )}

      {phase === 'app' && (
        <BrowserRouter>
          <Routes>
            <Route path="/landing" element={
              <motion.div
                key="landing-in-app"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                style={{ width: '100vw', height: '100vh', overflowY: 'auto', background: '#fff' }}
              >
                <LynxLanding onStart={() => setPhase('onboarding')} />
              </motion.div>
            } />
            <Route path="*" element={
              <motion.div
                key="app"
                className="flex h-screen overflow-hidden"
                style={{ background: 'var(--bg)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <DashboardLayout config={config} />
              </motion.div>
            } />
          </Routes>
        </BrowserRouter>
      )}
    </AnimatePresence>
  );
}

function DashboardLayout({ config }: { config: LynxConfig | null }) {
  return (
    <>
      <Sidebar
        projectPath={config?.projectPath}
        llmMode={config?.llm?.mode}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto" style={{ background: 'var(--bg)' }}>
          <Routes>
            <Route path="/"          element={<OverviewPage />} />
            <Route path="/tests"     element={<TestsPage />} />
            <Route path="/security"  element={<SecurityPage />} />
            <Route path="/monitor"   element={<MonitorPage />} />
            <Route path="/brain"     element={<BrainPage />} />
            <Route path="/scout"     element={<ScoutPage />} />
            <Route path="/approvals"    element={<ApprovalsPage />} />
            <Route path="/integrations" element={<IntegrationsPage />} />
            <Route path="/settings"     element={<SettingsPage />} />
          </Routes>
        </main>
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
    </>
  );
}


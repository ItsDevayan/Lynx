/**
 * Integrations page — connect Lynx to external tools
 *
 * Notion: create pages, search workspace, push Brain summaries
 * Slack:  webhook alerts for errors, approvals, security findings
 * Discord: webhook notifications
 * Figma:  inspect nodes, design→code via Stitch
 * Stitch: AI component generation from design context
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IntegrationState {
  connected: boolean;
  apiKey?: string;
  webhookUrl?: string;
  accessToken?: string;
  defaultDatabase?: string;
  defaultChannel?: string;
  baseUrl?: string;
}

interface IntegrationsConfig {
  notion:  IntegrationState;
  slack:   IntegrationState;
  discord: IntegrationState;
  figma:   IntegrationState;
  stitch:  IntegrationState;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchConfig(): Promise<IntegrationsConfig> {
  const r = await fetch('/api/integrations/config');
  if (!r.ok) throw new Error('Could not fetch integrations config');
  return r.json();
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function IntegrationCard({
  id,
  icon,
  title,
  description,
  state,
  children,
}: {
  id: string;
  icon: string;
  title: string;
  description: string;
  state: IntegrationState;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      className="rounded overflow-hidden"
      style={{ background: 'var(--surface)', border: `1px solid ${state.connected ? 'rgba(29,184,124,0.3)' : 'var(--border)'}` }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <button
        className="w-full flex items-center gap-3 px-5 py-4 text-left"
        onClick={() => setOpen(!open)}
      >
        <div
          className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 font-mono text-sm"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border-lit)', color: state.connected ? 'var(--teal)' : 'var(--text-dim)' }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold flex items-center gap-2">
            {title}
            {state.connected && (
              <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--teal-lo)', color: 'var(--teal)', fontSize: 10 }}>
                connected
              </span>
            )}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{description}</p>
        </div>
        <span className="font-mono text-xs" style={{ color: 'var(--text-mute)' }}>
          {open ? '▼' : '▶'}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <div className="px-5 py-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Field component ──────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-mono mb-1" style={{ color: 'var(--text-dim)' }}>{label}</label>
      <input
        type={type}
        className="w-full px-3 py-1.5 rounded text-xs font-mono outline-none"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--purple)'}
        onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
      />
    </div>
  );
}

// ─── Test result ──────────────────────────────────────────────────────────────

function TestResult({ result }: { result: { ok?: boolean; error?: string } | null }) {
  if (!result) return null;
  return (
    <p className="text-xs font-mono mt-2" style={{ color: result.ok ? 'var(--teal)' : 'var(--red)' }}>
      {result.ok ? '✓ Connected successfully' : `✗ ${result.error}`}
    </p>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function IntegrationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['integrations-config'], queryFn: fetchConfig });

  // Local draft state for each integration
  const [notion, setNotion] = useState({ apiKey: '', defaultDatabase: '' });
  const [slack, setSlack] = useState({ webhookUrl: '', defaultChannel: '#alerts' });
  const [discord, setDiscord] = useState({ webhookUrl: '' });
  const [figma, setFigma] = useState({ accessToken: '' });
  const [stitch, setStitch] = useState({ apiKey: '', baseUrl: '' });

  const [saving, setSaving] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok?: boolean; error?: string } | null>>({});

  // Figma quick-inspect
  const [figmaUrl, setFigmaUrl] = useState('');
  const [figmaResult, setFigmaResult] = useState<string | null>(null);
  const [figmaLoading, setFigmaLoading] = useState(false);

  // Stitch generate
  const [stitchPrompt, setStitchPrompt] = useState('');
  const [stitchFramework, setStitchFramework] = useState('react');
  const [stitchStyle, setStitchStyle] = useState('tailwind');
  const [stitchResult, setStitchResult] = useState<string | null>(null);
  const [stitchLoading, setStitchLoading] = useState(false);

  // Notion quick create
  const [notionTitle, setNotionTitle] = useState('');
  const [notionContent, setNotionContent] = useState('');
  const [notionResult, setNotionResult] = useState<{ url?: string; error?: string } | null>(null);

  // Slack quick message
  const [slackMsg, setSlackMsg] = useState('');
  const [slackResult, setSlackResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  const cfg = data ?? { notion: { connected: false }, slack: { connected: false }, discord: { connected: false }, figma: { connected: false }, stitch: { connected: false } };

  const save = async (service: string, payload: object) => {
    setSaving(service);
    try {
      const r = await fetch('/api/integrations/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [service]: payload }),
      });
      const d = await r.json();
      if (d.ok) {
        qc.invalidateQueries({ queryKey: ['integrations-config'] });
        setTestResults(t => ({ ...t, [service]: { ok: true } }));
      } else {
        setTestResults(t => ({ ...t, [service]: { error: d.error ?? 'Save failed' } }));
      }
    } catch (err: any) {
      setTestResults(t => ({ ...t, [service]: { error: err?.message } }));
    }
    setSaving(null);
  };

  const parseFigmaUrl = (url: string): { fileKey: string; nodeId?: string } | null => {
    const m = url.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/);
    if (!m) return null;
    const nodeM = url.match(/node-id=([^&]+)/);
    return { fileKey: m[1], nodeId: nodeM ? nodeM[1].replace(/-/g, ':') : undefined };
  };

  const handleFigmaInspect = async () => {
    const parsed = parseFigmaUrl(figmaUrl);
    if (!parsed) { setFigmaResult('Invalid Figma URL'); return; }
    setFigmaLoading(true);
    setFigmaResult(null);
    try {
      const r = await fetch('/api/integrations/figma/inspect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const d = await r.json();
      if (d.ok) setFigmaResult(JSON.stringify(d.context, null, 2));
      else setFigmaResult(`Error: ${d.error}`);
    } catch (err: any) {
      setFigmaResult(`Error: ${err?.message}`);
    }
    setFigmaLoading(false);
  };

  const handleStitchGenerate = async () => {
    setStitchLoading(true);
    setStitchResult(null);
    try {
      const r = await fetch('/api/integrations/stitch/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          designContext: stitchPrompt,
          framework: stitchFramework,
          styleSystem: stitchStyle,
          figmaFileKey: parseFigmaUrl(figmaUrl)?.fileKey,
          figmaNodeId: parseFigmaUrl(figmaUrl)?.nodeId,
        }),
      });
      const d = await r.json();
      setStitchResult(d.code ?? d.error ?? 'No output');
    } catch (err: any) {
      setStitchResult(`Error: ${err?.message}`);
    }
    setStitchLoading(false);
  };

  const handleNotionCreate = async () => {
    if (!notionTitle) return;
    try {
      const r = await fetch('/api/integrations/notion/create-page', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: notionTitle, content: notionContent }),
      });
      const d = await r.json();
      setNotionResult(d.ok ? { url: d.url } : { error: d.error });
    } catch (err: any) {
      setNotionResult({ error: err?.message });
    }
  };

  const handleSlackSend = async () => {
    if (!slackMsg) return;
    try {
      const r = await fetch('/api/integrations/slack/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: slackMsg }),
      });
      const d = await r.json();
      setSlackResult(d.ok ? { ok: true } : { error: d.error });
      if (d.ok) setSlackMsg('');
    } catch (err: any) {
      setSlackResult({ error: err?.message });
    }
  };

  if (isLoading) return (
    <div className="p-6">
      <p className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>loading integrations…</p>
    </div>
  );

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-base font-semibold">integrations</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
          Connect Lynx to Notion, Slack, Discord, Figma, and Stitch for ideation and design workflows
        </p>
      </div>

      <div className="space-y-3">
        {/* ── Notion ── */}
        <IntegrationCard
          id="notion"
          icon="N"
          title="Notion"
          description="Push Brain summaries, error reports, and feature ideas to your Notion workspace"
          state={cfg.notion}
        >
          <div className="space-y-3">
            <Field
              label="notion api key"
              value={notion.apiKey}
              onChange={v => setNotion(n => ({ ...n, apiKey: v }))}
              type="password"
              placeholder={cfg.notion.connected ? '(already set)' : 'secret_…'}
            />
            <Field
              label="default database id (optional)"
              value={notion.defaultDatabase}
              onChange={v => setNotion(n => ({ ...n, defaultDatabase: v }))}
              placeholder={cfg.notion.defaultDatabase ?? 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
            />
            <div className="flex gap-2">
              <button
                className="btn btn-primary text-xs"
                onClick={() => save('notion', notion)}
                disabled={saving === 'notion'}
              >
                {saving === 'notion' ? '…' : 'Save'}
              </button>
            </div>
            <TestResult result={testResults['notion'] ?? null} />

            {/* Quick create */}
            {cfg.notion.connected && (
              <div className="pt-3 space-y-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <p className="section-title">quick create page</p>
                <Field label="title" value={notionTitle} onChange={setNotionTitle} placeholder="My page title" />
                <div>
                  <label className="block text-xs font-mono mb-1" style={{ color: 'var(--text-dim)' }}>content</label>
                  <textarea
                    className="w-full px-3 py-1.5 rounded text-xs font-mono outline-none resize-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', height: 80 }}
                    value={notionContent}
                    onChange={e => setNotionContent(e.target.value)}
                    placeholder="Page content…"
                  />
                </div>
                <button className="btn btn-ghost text-xs" onClick={handleNotionCreate} disabled={!notionTitle}>
                  → Create page
                </button>
                {notionResult && (
                  <p className="text-xs font-mono" style={{ color: notionResult.url ? 'var(--teal)' : 'var(--red)' }}>
                    {notionResult.url ? `✓ Created: ${notionResult.url}` : `✗ ${notionResult.error}`}
                  </p>
                )}
              </div>
            )}
          </div>
        </IntegrationCard>

        {/* ── Slack ── */}
        <IntegrationCard
          id="slack"
          icon="S"
          title="Slack"
          description="Send error alerts, approval requests, and security findings to your Slack channels"
          state={cfg.slack}
        >
          <div className="space-y-3">
            <Field
              label="incoming webhook url"
              value={slack.webhookUrl}
              onChange={v => setSlack(s => ({ ...s, webhookUrl: v }))}
              type="password"
              placeholder={cfg.slack.connected ? '(already set)' : 'https://hooks.slack.com/services/…'}
            />
            <Field
              label="default channel (optional)"
              value={slack.defaultChannel}
              onChange={v => setSlack(s => ({ ...s, defaultChannel: v }))}
              placeholder="#alerts"
            />
            <div className="flex gap-2">
              <button
                className="btn btn-primary text-xs"
                onClick={() => save('slack', slack)}
                disabled={saving === 'slack'}
              >
                {saving === 'slack' ? '…' : 'Save'}
              </button>
            </div>
            <TestResult result={testResults['slack'] ?? null} />

            {cfg.slack.connected && (
              <div className="pt-3 space-y-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <p className="section-title">quick send</p>
                <Field label="message" value={slackMsg} onChange={setSlackMsg} placeholder="Hello from Lynx!" />
                <button className="btn btn-ghost text-xs" onClick={handleSlackSend} disabled={!slackMsg}>
                  → Send message
                </button>
                <TestResult result={slackResult} />
              </div>
            )}
          </div>
        </IntegrationCard>

        {/* ── Discord ── */}
        <IntegrationCard
          id="discord"
          icon="D"
          title="Discord"
          description="Post error notifications and deployment alerts to your Discord server"
          state={cfg.discord}
        >
          <div className="space-y-3">
            <Field
              label="webhook url"
              value={discord.webhookUrl}
              onChange={v => setDiscord({ webhookUrl: v })}
              type="password"
              placeholder={cfg.discord.connected ? '(already set)' : 'https://discord.com/api/webhooks/…'}
            />
            <div className="flex gap-2">
              <button
                className="btn btn-primary text-xs"
                onClick={() => save('discord', discord)}
                disabled={saving === 'discord' || !discord.webhookUrl}
              >
                {saving === 'discord' ? '…' : 'Save'}
              </button>
              {cfg.discord.connected && (
                <button
                  className="btn btn-ghost text-xs"
                  onClick={async () => {
                    const r = await fetch('/api/integrations/discord/send', {
                      method: 'POST', headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ content: '✓ Lynx Discord integration is working!' }),
                    });
                    const d = await r.json();
                    setTestResults(t => ({ ...t, discord: d }));
                  }}
                >
                  Test
                </button>
              )}
            </div>
            <TestResult result={testResults['discord'] ?? null} />
          </div>
        </IntegrationCard>

        {/* ── Figma ── */}
        <IntegrationCard
          id="figma"
          icon="F"
          title="Figma"
          description="Inspect design nodes, extract design tokens, and feed context into Stitch code generation"
          state={cfg.figma}
        >
          <div className="space-y-3">
            <Field
              label="personal access token"
              value={figma.accessToken}
              onChange={v => setFigma({ accessToken: v })}
              type="password"
              placeholder={cfg.figma.connected ? '(already set)' : 'figd_…'}
            />
            <div className="flex gap-2">
              <button
                className="btn btn-primary text-xs"
                onClick={() => save('figma', figma)}
                disabled={saving === 'figma' || !figma.accessToken}
              >
                {saving === 'figma' ? '…' : 'Save'}
              </button>
            </div>
            <TestResult result={testResults['figma'] ?? null} />

            {cfg.figma.connected && (
              <div className="pt-3 space-y-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <p className="section-title">quick inspect</p>
                <Field
                  label="figma url"
                  value={figmaUrl}
                  onChange={setFigmaUrl}
                  placeholder="https://figma.com/design/…?node-id=…"
                />
                <button
                  className="btn btn-ghost text-xs"
                  onClick={handleFigmaInspect}
                  disabled={figmaLoading || !figmaUrl}
                >
                  {figmaLoading ? '…' : '→ Inspect node'}
                </button>
                {figmaResult && (
                  <pre
                    className="text-xs p-2 rounded overflow-auto"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-dim)', maxHeight: 200, fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {figmaResult}
                  </pre>
                )}
              </div>
            )}
          </div>
        </IntegrationCard>

        {/* ── Stitch ── */}
        <IntegrationCard
          id="stitch"
          icon="✦"
          title="Stitch"
          description="AI design-to-code generation — turn Figma designs or descriptions into React/Vue/HTML components"
          state={cfg.stitch}
        >
          <div className="space-y-3">
            <Field
              label="stitch api key (optional — uses Lynx LLM if not set)"
              value={stitch.apiKey}
              onChange={v => setStitch(s => ({ ...s, apiKey: v }))}
              type="password"
              placeholder={cfg.stitch.connected ? '(already set)' : 'sk_stitch_… (leave blank to use Lynx executor)'}
            />
            <Field
              label="base url (optional)"
              value={stitch.baseUrl}
              onChange={v => setStitch(s => ({ ...s, baseUrl: v }))}
              placeholder={cfg.stitch.baseUrl ?? 'https://api.stitch.design'}
            />
            <button
              className="btn btn-primary text-xs"
              onClick={() => save('stitch', stitch)}
              disabled={saving === 'stitch'}
            >
              {saving === 'stitch' ? '…' : 'Save'}
            </button>
            <TestResult result={testResults['stitch'] ?? null} />

            {/* Code generator */}
            <div className="pt-3 space-y-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="section-title">generate component</p>

              <div>
                <label className="block text-xs font-mono mb-1" style={{ color: 'var(--text-dim)' }}>design description</label>
                <textarea
                  className="w-full px-3 py-2 rounded text-xs font-mono outline-none resize-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', height: 80 }}
                  value={stitchPrompt}
                  onChange={e => setStitchPrompt(e.target.value)}
                  placeholder="A card component with a title, description, tags row, and a CTA button. Dark background, subtle border, hover glow effect…"
                />
              </div>

              {figmaUrl && (
                <p className="text-xs font-mono" style={{ color: 'var(--teal)' }}>
                  ✓ Using Figma node from above
                </p>
              )}

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-mono mb-1" style={{ color: 'var(--text-dim)' }}>framework</label>
                  <select
                    className="w-full px-3 py-1.5 rounded text-xs font-mono outline-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    value={stitchFramework}
                    onChange={e => setStitchFramework(e.target.value)}
                  >
                    <option value="react">React</option>
                    <option value="vue">Vue</option>
                    <option value="html">HTML</option>
                    <option value="svelte">Svelte</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-mono mb-1" style={{ color: 'var(--text-dim)' }}>style system</label>
                  <select
                    className="w-full px-3 py-1.5 rounded text-xs font-mono outline-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    value={stitchStyle}
                    onChange={e => setStitchStyle(e.target.value)}
                  >
                    <option value="tailwind">Tailwind CSS</option>
                    <option value="css-modules">CSS Modules</option>
                    <option value="styled-components">styled-components</option>
                    <option value="css">Plain CSS</option>
                  </select>
                </div>
              </div>

              <button
                className="btn btn-primary text-xs"
                onClick={handleStitchGenerate}
                disabled={stitchLoading || !stitchPrompt}
              >
                {stitchLoading ? '… generating' : '✦ Generate component'}
              </button>

              <AnimatePresence>
                {stitchResult && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-mono" style={{ color: 'var(--teal)' }}>Generated code</p>
                      <button
                        className="text-xs font-mono"
                        style={{ color: 'var(--text-mute)' }}
                        onClick={() => navigator.clipboard.writeText(stitchResult)}
                      >
                        copy
                      </button>
                    </div>
                    <pre
                      className="text-xs p-3 rounded overflow-auto"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-dim)', maxHeight: 400, fontFamily: 'JetBrains Mono, monospace' }}
                    >
                      {stitchResult}
                    </pre>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </IntegrationCard>
      </div>

      {/* Usage notes */}
      <div className="mt-6 rounded p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="section-title mb-3">how to use from Brain</p>
        <div className="space-y-2 text-xs" style={{ color: 'var(--text-dim)' }}>
          {[
            ['Notion', '"Send this analysis to Notion as a page"'],
            ['Slack',  '"Alert Slack about the CRITICAL CVE in lodash"'],
            ['Discord', '"Post this error summary to Discord"'],
            ['Figma', '"Inspect this Figma component: figma.com/design/…"'],
            ['Stitch', '"Generate a React card component from this Figma design"'],
          ].map(([tool, example]) => (
            <div key={tool} className="flex gap-2">
              <span className="font-mono flex-shrink-0" style={{ color: 'var(--purple-hi)', minWidth: 60 }}>{tool}</span>
              <span className="italic">{example}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

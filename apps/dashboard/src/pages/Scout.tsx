/**
 * Scout page — competitor intelligence
 *
 * Fetches cached report from GET /api/scout.
 * Triggers a new run via POST /api/scout/run.
 * Polls every 5s while running.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GithubRepo {
  name: string;
  description: string;
  url: string;
  language?: string;
  stars: number;
  starsToday: number;
}

interface HNStory {
  title: string;
  url?: string;
  points: number;
  numComments: number;
  createdAt: string;
}

interface ScoutReport {
  generatedAt: string;
  topics: string[];
  github: GithubRepo[];
  hn: HNStory[];
  analysis: string;
  featureGaps: string[];
}

interface ScoutResponse {
  report: ScoutReport | null;
  running: boolean;
  lastRun: string | null;
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchScout(): Promise<ScoutResponse> {
  const r = await fetch('/api/scout');
  if (!r.ok) throw new Error('Scout API unavailable');
  return r.json();
}

// ─── Components ───────────────────────────────────────────────────────────────

function GithubCard({ repo }: { repo: GithubRepo }) {
  return (
    <a
      href={repo.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded p-3 transition-all"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', textDecoration: 'none' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-lit)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="font-mono text-xs font-semibold" style={{ color: 'var(--purple-hi)' }}>
          {repo.name}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {repo.language && (
            <span className="font-mono text-xs" style={{ color: 'var(--text-mute)' }}>
              {repo.language}
            </span>
          )}
          <span
            className="font-mono text-xs px-1.5 py-0.5 rounded"
            style={{ background: 'var(--teal-lo)', color: 'var(--teal)', border: '1px solid rgba(29,184,124,0.3)' }}
          >
            +{repo.starsToday.toLocaleString()} ★/wk
          </span>
        </div>
      </div>
      {repo.description && (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>
          {repo.description.slice(0, 120)}
        </p>
      )}
      <p className="text-xs mt-1 font-mono" style={{ color: 'var(--text-mute)' }}>
        {repo.stars.toLocaleString()} total stars
      </p>
    </a>
  );
}

function HNCard({ story }: { story: HNStory }) {
  const El = story.url ? 'a' : 'div';
  return (
    <El
      {...(story.url ? { href: story.url, target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="flex items-start gap-3 py-2 px-3 rounded transition-all"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        textDecoration: 'none',
        display: 'flex',
      } as React.CSSProperties}
      onMouseEnter={(e: React.MouseEvent<HTMLElement>) => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-lit)'}
      onMouseLeave={(e: React.MouseEvent<HTMLElement>) => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
    >
      <span
        className="font-mono text-xs tabular-nums flex-shrink-0 mt-0.5"
        style={{ color: 'var(--amber)', minWidth: 32 }}
      >
        {story.points}
      </span>
      <div className="min-w-0">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text)' }}>
          {story.title}
        </p>
        <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-mute)' }}>
          {story.numComments} comments · {formatDistanceToNow(new Date(story.createdAt), { addSuffix: true })}
        </p>
      </div>
    </El>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ScoutPage() {
  const qc = useQueryClient();
  const [topicsInput, setTopicsInput] = useState('');
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'analysis' | 'github' | 'hn'>('analysis');

  const { data, isLoading } = useQuery({
    queryKey: ['scout'],
    queryFn: fetchScout,
    refetchInterval: running ? 4_000 : 60_000,
    onSuccess: (d: ScoutResponse) => {
      if (!d.running) setRunning(false);
    },
  } as any);

  const report = (data as ScoutResponse | undefined)?.report;
  const isRunning = running || (data as ScoutResponse | undefined)?.running;

  const handleRun = async () => {
    setRunning(true);
    const topics = topicsInput
      ? topicsInput.split(',').map(t => t.trim()).filter(Boolean)
      : undefined;
    try {
      await fetch('/api/scout/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topics }),
      });
      setTimeout(() => qc.invalidateQueries({ queryKey: ['scout'] }), 1000);
    } catch {
      setRunning(false);
    }
  };

  const tabs = [
    { id: 'analysis' as const, label: 'analysis' },
    { id: 'github' as const,   label: `github (${report?.github?.length ?? 0})` },
    { id: 'hn' as const,       label: `hn (${report?.hn?.length ?? 0})` },
  ];

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-base font-semibold">scout</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
            GitHub trending · HackerNews · LLM feature gap analysis
          </p>
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <span className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>
              last run {formatDistanceToNow(new Date(report.generatedAt), { addSuffix: true })}
            </span>
          )}
          <button
            onClick={handleRun}
            disabled={!!isRunning}
            className="btn btn-primary font-mono text-xs"
            style={{ opacity: isRunning ? 0.6 : 1 }}
          >
            {isRunning ? (
              <span className="flex items-center gap-1.5">
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                  style={{ display: 'inline-block' }}
                >
                  ◌
                </motion.span>
                scanning…
              </span>
            ) : '▶ run scout'}
          </button>
        </div>
      </div>

      {/* Topics input */}
      <div className="mb-5 flex items-center gap-2">
        <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--text-dim)' }}>topics:</span>
        <input
          className="flex-1 px-3 py-1.5 rounded text-xs font-mono outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
          placeholder="AI devops, error monitoring, code review AI, … (comma separated)"
          value={topicsInput}
          onChange={e => setTopicsInput(e.target.value)}
          onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--purple)'}
          onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
        />
      </div>

      {/* Running state */}
      {isRunning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-4 px-4 py-3 rounded flex items-center gap-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex gap-1">
            {[0, 0.15, 0.3].map((d, i) => (
              <motion.span
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--purple)' }}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 0.9, delay: d, repeat: Infinity }}
              />
            ))}
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
            fetching GitHub trending, HN stories, running LLM analysis…
          </span>
        </motion.div>
      )}

      {/* Empty state */}
      {!isLoading && !report && !isRunning && (
        <div className="text-center py-24">
          <p className="font-mono text-4xl mb-4" style={{ color: 'var(--text-mute)' }}>◉</p>
          <p className="font-semibold mb-1">no scout data yet</p>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            Click <span className="font-mono" style={{ color: 'var(--purple)' }}>▶ run scout</span> to fetch GitHub trending and HN stories.
          </p>
        </div>
      )}

      {/* Report */}
      <AnimatePresence>
        {report && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* Topics */}
            {report.topics?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {report.topics.map(t => (
                  <span
                    key={t}
                    className="font-mono text-xs px-2 py-0.5 rounded"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 mb-4" style={{ borderBottom: '1px solid var(--border)' }}>
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="font-mono text-xs px-3 py-2 transition-all"
                  style={{
                    color: activeTab === tab.id ? 'var(--text)' : 'var(--text-dim)',
                    borderBottom: activeTab === tab.id ? '2px solid var(--purple)' : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <AnimatePresence mode="wait">
              {activeTab === 'analysis' && (
                <motion.div
                  key="analysis"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  {/* LLM analysis */}
                  {report.analysis && (
                    <div
                      className="rounded p-4"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    >
                      <p className="section-title mb-2">market analysis</p>
                      <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-dim)' }}>
                        {report.analysis}
                      </p>
                    </div>
                  )}

                  {/* Feature gaps */}
                  {report.featureGaps?.length > 0 && (
                    <div
                      className="rounded p-4"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    >
                      <p className="section-title mb-3">feature gaps / opportunities</p>
                      <div className="space-y-2">
                        {report.featureGaps.map((gap, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className="font-mono flex-shrink-0 mt-0.5" style={{ color: 'var(--amber)' }}>→</span>
                            <span style={{ color: 'var(--text-dim)' }}>{gap}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!report.analysis && !report.featureGaps?.length && (
                    <p className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>
                      No analysis yet. Configure orchestrator LLM in Settings.
                    </p>
                  )}
                </motion.div>
              )}

              {activeTab === 'github' && (
                <motion.div
                  key="github"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid gap-2"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
                >
                  {report.github?.length > 0
                    ? report.github.map((r) => <GithubCard key={r.name} repo={r} />)
                    : <p className="text-xs font-mono col-span-2" style={{ color: 'var(--text-mute)' }}>No GitHub data. Run scout to fetch trending repos.</p>
                  }
                </motion.div>
              )}

              {activeTab === 'hn' && (
                <motion.div
                  key="hn"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-1.5"
                >
                  {report.hn?.length > 0
                    ? report.hn.map((s, i) => <HNCard key={i} story={s} />)
                    : <p className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>No HN data. Run scout to fetch stories.</p>
                  }
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

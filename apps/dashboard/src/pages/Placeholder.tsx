import { motion } from 'framer-motion';

interface PlaceholderProps {
  icon: string;
  title: string;
  description: string;
  phase: number;
  features: string[];
}

function Placeholder({ icon, title, description, phase, features }: PlaceholderProps) {
  return (
    <div className="p-6 max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center font-mono text-lg"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border-lit)', color: 'var(--purple-hi)' }}
          >
            {icon}
          </div>
          <div>
            <h1 className="text-sm font-semibold">{title}</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{description}</p>
          </div>
          <span
            className="ml-auto badge"
            style={{ background: 'var(--purple-lo)', color: 'var(--purple-hi)', border: '1px solid rgba(124,111,205,0.3)' }}
          >
            phase {phase}
          </span>
        </div>

        <div className="rounded p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="section-title mb-3">planned features</p>
          <div className="space-y-2">
            {features.map((f) => (
              <div key={f} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-dim)' }}>
                <span className="font-mono flex-shrink-0 mt-0.5" style={{ color: 'var(--text-mute)' }}>○</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export const TestsPage = () => (
  <Placeholder
    icon="⚗"
    title="tests"
    description="Auto-detect framework · run · fix failing code · generate edge cases"
    phase={3}
    features={[
      'Auto-detect Jest, Vitest, pytest, Go test, cargo test, and more',
      'Run tests and parse structured failure output',
      'LLM fix agent: edit CODE only (never tests), max 3 iterations',
      'If root cause is architectural: emit ChangeProposal.md for human review',
      'Generate edge-case tests from function signatures',
      'RLVR loop: edit → run → pass/fail → iterate',
    ]}
  />
);

export const SecurityPage = () => (
  <Placeholder
    icon="⬡"
    title="security"
    description="SAST · CVE scanning · K8s watchdog · Falco runtime detection"
    phase={4}
    features={[
      'Semgrep SAST: spawn-and-kill pattern, on-demand scan',
      'Trivy CVE: scan dependencies for known vulnerabilities',
      'Kubernetes pod watchdog: detect anomalous resource usage',
      'Falco integration: eBPF runtime threat events via webhook',
      'Structured incident reports: why is process A behaving like X',
      'HITL approval for all auto-patches',
    ]}
  />
);

export const ScoutPage = () => (
  <Placeholder
    icon="◉"
    title="scout"
    description="Competitor intelligence · GitHub trends · HN sentiment · feature gaps"
    phase={5}
    features={[
      'GitHub trending: track repos in your niche, weekly diffs',
      'HackerNews Algolia: sentiment and mentions of your competitors',
      'ProductHunt RSS: new launches in adjacent spaces',
      'LLM analysis: what are they shipping that you are not?',
      'Feature gap report: auto-generated markdown diff of capabilities',
      'BullMQ scheduled jobs: runs weekly, results in Scout tab',
    ]}
  />
);

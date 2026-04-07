import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Lightweight markdown renderer ───────────────────────────────────────────
// Handles: **bold**, *italic*, `code`, ```blocks```, ## headers, - lists, links

function renderMarkdown(text: string): React.ReactNode[] {
  // Split into code blocks first to avoid processing their content
  const segments = text.split(/(```[\w]*\n[\s\S]*?```)/g);
  return segments.map((seg, si) => {
    if (seg.startsWith('```')) {
      const langMatch = seg.match(/^```(\w*)\n/);
      const lang = langMatch?.[1] ?? '';
      const code = seg.replace(/^```\w*\n/, '').replace(/```$/, '');
      return (
        <pre
          key={si}
          className="rounded p-3 my-2 overflow-x-auto text-xs leading-relaxed"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-dim)' }}
        >
          {lang && <span style={{ color: 'var(--text-mute)', fontSize: 10 }}>{lang}\n</span>}
          {code}
        </pre>
      );
    }
    // Process inline content line by line
    const lines = seg.split('\n');
    return (
      <span key={si}>
        {lines.map((line, li) => {
          const isH2 = line.startsWith('## ');
          const isH3 = line.startsWith('### ');
          const isBullet = /^\s*[-*]\s/.test(line);
          const content = isH2 ? line.slice(3) : isH3 ? line.slice(4) : isBullet ? line.replace(/^\s*[-*]\s/, '') : line;

          const inlineNodes = renderInline(content);

          if (isH2) return <p key={li} className="font-semibold mt-3 mb-1 text-xs" style={{ color: 'var(--text)' }}>{inlineNodes}</p>;
          if (isH3) return <p key={li} className="font-semibold mt-2 mb-0.5 text-xs" style={{ color: 'var(--text-dim)' }}>{inlineNodes}</p>;
          if (isBullet) return <div key={li} className="flex gap-1.5 text-xs my-0.5"><span style={{ color: 'var(--purple)', flexShrink: 0 }}>·</span><span>{inlineNodes}</span></div>;
          if (line === '') return <br key={li} />;
          return <span key={li}>{inlineNodes}{li < lines.length - 1 ? '\n' : ''}</span>;
        })}
      </span>
    );
  });
}

function renderInline(text: string): React.ReactNode[] {
  // Split on bold, italic, inline code, links
  const parts = text.split(/(\*\*[\s\S]+?\*\*|\*[\s\S]+?\*|`[^`]+`|\[.+?\]\(.+?\))/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} style={{ color: 'var(--text)' }}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('*') && p.endsWith('*')) return <em key={i} style={{ color: 'var(--text-dim)' }}>{p.slice(1, -1)}</em>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="rounded px-1" style={{ background: 'var(--surface2)', color: 'var(--purple-hi)', fontSize: '0.9em', fontFamily: 'JetBrains Mono, monospace' }}>{p.slice(1, -1)}</code>;
    const linkMatch = p.match(/^\[(.+?)\]\((.+?)\)$/);
    if (linkMatch) return <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'underline' }}>{linkMatch[1]}</a>;
    return p;
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FullConfig {
  projectPath?: string;
  projectName?: string;
  llm?: { mode: string };
  orchestrator?: { provider: string; model?: string };
  executor?: { provider: string; bundleId?: string };
  projectAnswers?: Record<string, string>;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  // routing metadata (assistant messages only)
  task?: string;
  conductor?: string;
  specialist?: string;
  executionMode?: string;
  stepsLog?: string[];
  isBottleneck?: boolean;
  bottleneck?: string;
  // HITL
  hitlId?: string;
  hitlStatus?: 'pending' | 'approved' | 'rejected';
  hasCodeProposal?: boolean;
}

// ─── HITL helpers ─────────────────────────────────────────────────────────────

/** Returns true when a Brain response contains a code block that looks like a file change */
function detectsCodeProposal(content: string): boolean {
  // Must have at least one non-trivial fenced code block (≥4 lines)
  const blocks = content.match(/```[\w]*\n([\s\S]*?)```/g) ?? [];
  return blocks.some(b => b.split('\n').length >= 6);
}

/** Extract first code block and guess affected files from context */
function extractProposalDiff(content: string): string {
  const m = content.match(/```[\w]*\n([\s\S]*?)```/);
  return m ? m[0] : content.slice(0, 2000);
}

async function createHITLRequest(opts: {
  title: string;
  description: string;
  thinking?: string;
  diff: string;
  projectPath?: string;
  sessionId: string;
  triggerMessage: string;
}): Promise<string | null> {
  try {
    const r = await fetch('/api/hitl', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: opts.title,
        description: opts.description,
        action: 'CODE_CHANGE',
        thinking: opts.thinking,
        proposal: {
          type: 'diff',
          content: opts.diff,
          reversible: true,
          riskLevel: 'MEDIUM',
        },
        context: {
          sessionId: opts.sessionId,
          projectPath: opts.projectPath ?? '',
          triggerMessage: opts.triggerMessage,
        },
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.id as string;
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getConfig(): FullConfig | null {
  try {
    const s = localStorage.getItem('lynx_config');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

function getSessionId(): string {
  let id = sessionStorage.getItem('lynx_brain_session');
  if (!id) {
    id = `brain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem('lynx_brain_session', id);
  }
  return id;
}

const TASK_COLOR: Record<string, string> = {
  general:      'var(--teal)',
  'code-easy':  'var(--purple)',
  'code-hard':  'var(--purple-hi)',
  reasoning:    'var(--amber)',
  autocomplete: 'var(--text-dim)',
  bottleneck:   'var(--red)',
};

const TASK_LABEL: Record<string, string> = {
  general:      'general',
  'code-easy':  'code',
  'code-hard':  'code·hard',
  reasoning:    'reasoning',
  autocomplete: 'autocomplete',
  bottleneck:   'bottleneck',
};

const SUGGESTION_GROUPS = [
  {
    label: 'understand',
    color: 'var(--teal)',
    items: [
      'Explain the architecture of this project',
      'How does data flow from ingest to the dashboard?',
      'What are the most complex files in this codebase?',
    ],
  },
  {
    label: 'code',
    color: 'var(--purple-hi)',
    items: [
      'Write a test for the ingest endpoint',
      'Refactor the largest function you can find',
      'Add error handling to all API routes that are missing it',
    ],
  },
  {
    label: 'security',
    color: 'var(--amber)',
    items: [
      'Which dependencies have known CVEs?',
      'Check for exposed secrets or hardcoded credentials',
      'Review authentication and session handling',
    ],
  },
  {
    label: 'ops',
    color: 'var(--text-dim)',
    items: [
      'What are the most critical errors right now?',
      'What should I refactor first for performance?',
      "What's changed in the last 5 commits?",
    ],
  },
];

// ─── Slash commands ───────────────────────────────────────────────────────────

interface SlashCommand {
  cmd: string;
  description: string;
  expand: (projectPath?: string) => string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    cmd: '/errors',
    description: 'Show latest errors from the monitor',
    expand: () => 'What are the most recent and critical errors in the monitor? Group by severity and explain the most important ones.',
  },
  {
    cmd: '/scan',
    description: 'Scan and summarize project structure',
    expand: (p) => `Scan and summarize the project at ${p ?? 'this path'}. Tell me the primary language, framework, key directories, and anything that looks unusual or worth improving.`,
  },
  {
    cmd: '/test',
    description: 'Generate tests for a file or function',
    expand: () => 'Write comprehensive unit tests for the most important untested functions in this codebase. Use the detected test framework and follow the existing test patterns.',
  },
  {
    cmd: '/explain',
    description: 'Explain the overall architecture',
    expand: () => 'Explain the overall architecture of this project: how data flows through the system, the key components and their responsibilities, and the most important design decisions.',
  },
  {
    cmd: '/search',
    description: 'Search for a pattern in the codebase',
    expand: () => 'Search for: ',
  },
  {
    cmd: '/security',
    description: 'Check for security vulnerabilities',
    expand: () => 'Review this codebase for security vulnerabilities. Check for: injection risks, exposed secrets, insecure dependencies, and authentication issues. List findings by severity.',
  },
  {
    cmd: '/refactor',
    description: 'Suggest refactoring opportunities',
    expand: () => 'Identify the top 3-5 refactoring opportunities in this codebase. Focus on code that is complex, duplicated, or hard to maintain. Explain the benefit of each refactor.',
  },
  {
    cmd: '/crawl',
    description: 'Index project into Qdrant for semantic search',
    expand: (p) => `/crawl ${p ?? ''}`,
  },
  {
    cmd: '/git',
    description: 'Show git status, diff, and recent commits',
    expand: () => '/git status',
  },
  {
    cmd: '/notion',
    description: 'Push this chat / analysis to Notion',
    expand: () => '/notion push: ',
  },
  {
    cmd: '/slack',
    description: 'Send a message or alert to Slack',
    expand: () => '/slack: ',
  },
  {
    cmd: '/design',
    description: 'Design studio — describe a UI and generate code',
    expand: () => '/design ',
  },
  {
    cmd: '/remember',
    description: 'Save something to the shared project memory',
    expand: () => '/remember ',
  },
  {
    cmd: '/memory',
    description: 'Show current project memory',
    expand: () => '/memory',
  },
  {
    cmd: '/model',
    description: 'Switch the active model for this conversation',
    expand: () => '/model ',
  },
];

function SlashMenu({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (cmd: SlashCommand) => void;
}) {
  const filtered = SLASH_COMMANDS.filter(c =>
    c.cmd.startsWith(query) || c.description.toLowerCase().includes(query.slice(1).toLowerCase())
  );
  if (filtered.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      className="absolute bottom-full left-0 right-0 mb-1 rounded overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', zIndex: 50 }}
    >
      {filtered.map((cmd) => (
        <button
          key={cmd.cmd}
          onClick={() => onSelect(cmd)}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs transition-all"
          style={{ borderBottom: '1px solid var(--border)' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--overlay)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
        >
          <span className="font-mono font-bold" style={{ color: 'var(--purple)', minWidth: 80 }}>{cmd.cmd}</span>
          <span style={{ color: 'var(--text-dim)' }}>{cmd.description}</span>
        </button>
      ))}
    </motion.div>
  );
}

// ─── Routing badge ────────────────────────────────────────────────────────────

function RoutingBadge({ msg }: { msg: Message }) {
  const [open, setOpen] = useState(false);
  if (!msg.task) return null;
  const color = TASK_COLOR[msg.task] ?? 'var(--text-dim)';
  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      {/* task type */}
      <span
        className="font-mono text-xs px-1.5 py-0.5 rounded"
        style={{ background: 'var(--surface2)', color, border: `1px solid ${color}40` }}
      >
        {TASK_LABEL[msg.task] ?? msg.task}
      </span>
      {/* model path */}
      {msg.specialist && msg.specialist !== 'conductor (fallback)' && (
        <span className="font-mono text-xs" style={{ color: 'var(--text-mute)' }}>
          {msg.conductor !== 'heuristic'
            ? `${msg.conductor} → ${msg.specialist}`
            : msg.specialist}
        </span>
      )}
      {msg.executionMode === 'parallel' && (
        <span
          className="font-mono text-xs px-1.5 py-0.5 rounded"
          style={{ background: 'var(--teal-lo)', color: 'var(--teal)', border: '1px solid rgba(29,184,124,0.3)' }}
        >
          parallel
        </span>
      )}
      {msg.isBottleneck && (
        <span
          className="font-mono text-xs px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(255,80,80,0.1)', color: 'var(--red)', border: '1px solid rgba(255,80,80,0.3)' }}
        >
          bottleneck
        </span>
      )}
      {/* steps log toggle */}
      {msg.stepsLog && msg.stepsLog.length > 0 && (
        <button
          onClick={() => setOpen(!open)}
          className="font-mono text-xs"
          style={{ color: 'var(--text-mute)', textDecoration: 'underline dotted' }}
        >
          {open ? 'hide trace' : 'trace'}
        </button>
      )}
      <AnimatePresence>
        {open && msg.stepsLog && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full overflow-hidden"
          >
            <pre
              className="text-xs p-2 rounded mt-1 overflow-x-auto"
              style={{ background: 'var(--bg)', color: 'var(--text-mute)', border: '1px solid var(--border)', fontFamily: 'JetBrains Mono, monospace' }}
            >
              {msg.stepsLog.join('\n')}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

// Available models for /model switching
const AVAILABLE_MODELS = [
  { id: 'default',              label: 'Default (config)',     desc: 'Uses orchestrator from settings' },
  { id: 'groq:llama3-70b',     label: 'Groq / Llama 3 70B',  desc: 'Fast reasoning, free tier' },
  { id: 'groq:gemma2-9b',      label: 'Groq / Gemma 2 9B',   desc: 'Google Gemma, fast + capable' },
  { id: 'groq:deepseek-r1',    label: 'Groq / DeepSeek R1',  desc: 'Strong reasoning, chain-of-thought' },
  { id: 'ollama:qwen2.5',      label: 'Ollama / Qwen 2.5',   desc: 'Local, multilingual, fast' },
  { id: 'ollama:deepseek-r1',  label: 'Ollama / DeepSeek R1', desc: 'Local reasoning model' },
  { id: 'ollama:gemma3',       label: 'Ollama / Gemma 3',    desc: 'Local Google Gemma' },
  { id: 'claude-api',          label: 'Claude API',           desc: 'claude-sonnet-4-6, best quality' },
  { id: 'openai:gpt-4o',       label: 'OpenAI GPT-4o',       desc: 'General + vision' },
];

// Model capability map — what each model is best/worst at
const MODEL_CAPABILITIES: Record<string, { name: string; bestFor: string[]; notIdealFor: string[] }> = {
  'default':             { name: 'config default', bestFor: ['*'],                                        notIdealFor: [] },
  'groq:llama3-70b':    { name: 'Llama 3 70B',    bestFor: ['general', 'reasoning', 'code-easy'],        notIdealFor: ['code-hard'] },
  'groq:gemma2-9b':     { name: 'Gemma 2 9B',     bestFor: ['general', 'autocomplete'],                  notIdealFor: ['code-hard', 'reasoning'] },
  'groq:deepseek-r1':   { name: 'DeepSeek R1',    bestFor: ['reasoning', 'code-hard', 'code-easy'],      notIdealFor: [] },
  'ollama:qwen2.5':     { name: 'Qwen 2.5',       bestFor: ['general', 'autocomplete', 'code-easy'],     notIdealFor: ['code-hard', 'reasoning'] },
  'ollama:deepseek-r1': { name: 'DeepSeek R1',    bestFor: ['reasoning', 'code-hard'],                   notIdealFor: ['general'] },
  'ollama:gemma3':      { name: 'Gemma 3',        bestFor: ['general', 'autocomplete'],                  notIdealFor: ['code-hard', 'reasoning'] },
  'claude-api':         { name: 'Claude',         bestFor: ['*'],                                        notIdealFor: [] },
  'openai:gpt-4o':      { name: 'GPT-4o',         bestFor: ['*'],                                        notIdealFor: [] },
};

// Which model IDs are recommended per task type (ordered best-first)
const TASK_BEST_MODELS: Record<string, string[]> = {
  'reasoning':    ['groq:deepseek-r1', 'ollama:deepseek-r1', 'claude-api', 'openai:gpt-4o', 'groq:llama3-70b'],
  'code-hard':    ['groq:deepseek-r1', 'claude-api', 'openai:gpt-4o', 'ollama:deepseek-r1'],
  'code-easy':    ['groq:llama3-70b', 'groq:deepseek-r1', 'claude-api', 'openai:gpt-4o'],
  'general':      ['groq:llama3-70b', 'ollama:qwen2.5', 'claude-api', 'default'],
  'autocomplete': ['groq:gemma2-9b', 'ollama:qwen2.5', 'ollama:gemma3'],
};

/**
 * Returns a suggested alternative model when the active model is a poor fit for the task.
 * Returns null if the active model is fine.
 */
function getSwitchSuggestion(
  activeModel: string,
  task?: string,
): { id: string; label: string; desc: string; reason: string } | null {
  if (!task) return null;
  const caps = MODEL_CAPABILITIES[activeModel];
  if (!caps) return null;
  // '*' means universally capable — no suggestion needed
  if (caps.bestFor.includes('*')) return null;
  // Not flagged as a weak fit for this task
  if (!caps.notIdealFor.includes(task)) return null;

  const bestList = TASK_BEST_MODELS[task] ?? [];
  const suggestion = bestList.find(id => id !== activeModel && AVAILABLE_MODELS.find(m => m.id === id));
  if (!suggestion) return null;
  const model = AVAILABLE_MODELS.find(m => m.id === suggestion);
  if (!model) return null;

  const reasonMap: Record<string, string> = {
    'code-hard': 'complex code tasks benefit from stronger reasoning',
    'reasoning': 'this is a deep reasoning task',
    'code-easy': 'a larger model can produce cleaner code',
    'general':   'a general-purpose model may respond faster',
    'autocomplete': 'a lighter model is faster for completions',
  };
  return { ...model, reason: reasonMap[task] ?? `better fit for ${task}` };
}

// ─── Model suggestion chip ────────────────────────────────────────────────────

function ModelSuggestionChip({
  activeModel,
  task,
  onSwitch,
}: {
  activeModel: string;
  task?: string;
  onSwitch: (id: string) => void;
}) {
  const suggestion = getSwitchSuggestion(activeModel, task);
  if (!suggestion) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2 flex items-center gap-2 flex-wrap"
    >
      <span className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>
        ⚡ {suggestion.reason} —
      </span>
      <button
        onClick={() => onSwitch(suggestion.id)}
        className="font-mono text-xs px-2 py-0.5 rounded transition-all"
        style={{
          background: 'var(--amber-lo)',
          color: 'var(--amber)',
          border: '1px solid rgba(212,160,23,0.35)',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(212,160,23,0.2)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--amber-lo)'}
      >
        switch to {suggestion.label}
      </button>
    </motion.div>
  );
}

const HISTORY_KEY = 'lynx_brain_history';

function loadHistory(): Message[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Message[];
    // Keep last 60 messages to avoid bloat
    return Array.isArray(parsed) ? parsed.slice(-60) : [];
  } catch { return []; }
}

export function BrainPage() {
  const [messages, setMessages] = useState<Message[]>(loadHistory);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<number | null>(null);
  const [sessionId] = useState(getSessionId);
  const [showSlash, setShowSlash] = useState(false);
  const [activeModel, setActiveModel] = useState('default');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const config = getConfig();

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-60))); } catch { /* quota */ }
  }, [messages]);

  const sendForApproval = useCallback(async (msgIdx: number, userPrompt: string) => {
    const msg = messages[msgIdx];
    if (!msg) return;
    setMessages((m) => m.map((x, i) => i === msgIdx ? { ...x, hitlStatus: 'pending' } : x));

    const title = userPrompt.slice(0, 80);
    const diff  = extractProposalDiff(msg.content);
    const id = await createHITLRequest({
      title: `Brain proposal: ${title}`,
      description: userPrompt,
      thinking: msg.thinking,
      diff,
      projectPath: config?.projectPath,
      sessionId,
      triggerMessage: userPrompt,
    });

    setMessages((m) => m.map((x, i) =>
      i === msgIdx ? { ...x, hitlId: id ?? undefined, hitlStatus: id ? 'pending' : undefined } : x
    ));
  }, [messages, config?.projectPath, sessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // HITL approval/rejection listener — update message status when approved in the Approvals page
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (!msg?.data?.id) return;
      if (msg.type === 'hitl:applied') {
        setMessages(m => m.map(x =>
          x.hitlId === msg.data.id ? { ...x, hitlStatus: 'approved' } : x
        ));
      } else if (msg.type === 'hitl:rejected') {
        setMessages(m => m.map(x =>
          x.hitlId === msg.data.id ? { ...x, hitlStatus: 'rejected' } : x
        ));
      }
    };
    window.addEventListener('lynx:ws', handler);
    return () => window.removeEventListener('lynx:ws', handler);
  }, []);

  // Fetch shared project memory context
  const fetchMemoryContext = async (): Promise<string> => {
    if (!config?.projectPath) return '';
    try {
      const r = await fetch(`/api/memory/context?projectPath=${encodeURIComponent(config.projectPath)}&maxEntries=15`);
      if (!r.ok) return '';
      const d = await r.json();
      return d.context ?? '';
    } catch {
      return '';
    }
  };

  // Fetch relevant code snippets from Qdrant RAG for a query
  const fetchRagContext = async (query: string): Promise<string> => {
    if (!config?.projectPath) return '';
    try {
      const r = await fetch('/api/crawl/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, projectPath: config.projectPath, limit: 5 }),
      });
      if (!r.ok) return '';
      const data = await r.json();
      if (!data.hits?.length) return '';
      const snippets = data.hits.slice(0, 4).map((h: any) =>
        `// ${h.file}:${h.startLine}\n${(h.content ?? '').slice(0, 300)}`
      ).join('\n\n---\n\n');
      return `\n\nRelevant code context (from RAG index):\n\`\`\`\n${snippets}\n\`\`\``;
    } catch {
      return ''; // Qdrant not available — no RAG context
    }
  };

  // Build system context from provisioning answers + memory + RAG
  const buildSystemContext = (ragContext = '', memoryContext = '', currentModel = 'default'): string => {
    const caps = MODEL_CAPABILITIES[currentModel];
    const modelNote = caps && !caps.bestFor.includes('*')
      ? `\nYou are running as ${caps.name}. You are well-suited for: ${caps.bestFor.join(', ')}. For tasks involving ${caps.notIdealFor.join(' or ')}, proactively mention that the user could get better results by switching to a more capable model (e.g. DeepSeek R1 for reasoning, Claude API for complex code).`
      : '';

    const parts: string[] = [
      'You are Lynx, an AI engineering partner embedded in the developer\'s codebase.',
      'You help developers understand their codebase, debug errors, review security, and make architectural decisions.',
      'Always show your reasoning before your answer. Be concise and technical.',
      ...(modelNote ? [modelNote] : []),
    ];
    if (config?.projectPath) {
      parts.push(`\nProject path: ${config.projectPath}`);
    }
    if (config?.projectAnswers && Object.keys(config.projectAnswers).length > 0) {
      parts.push('\nProject context (from onboarding):');
      for (const [k, v] of Object.entries(config.projectAnswers)) {
        parts.push(`  ${k}: ${v}`);
      }
    }
    if (config?.orchestrator?.provider) {
      parts.push(`\nOrchestrator: ${config.orchestrator.provider}`);
    }
    if (memoryContext) {
      parts.push('\n' + memoryContext);
    }
    if (ragContext) {
      parts.push(ragContext);
    }
    return parts.join('\n');
  };

  const handleSlashSelect = useCallback((cmd: SlashCommand) => {
    const expanded = cmd.expand(config?.projectPath);
    setInput(expanded);
    setShowSlash(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [config?.projectPath]);

  const handleInputChange = (val: string) => {
    setInput(val);
    setShowSlash(val.startsWith('/') && val.length >= 1 && !val.includes(' '));
  };

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isThinking) return;
    setInput('');
    setShowSlash(false);
    setMessages((m) => [...m, { role: 'user', content: msg }]);
    setIsThinking(true);

    // ── /scan — call project scan API directly ────────────────────────────
    if ((msg === '/scan' || msg.toLowerCase().startsWith('scan and summarize')) && config?.projectPath) {
      try {
        const r = await fetch('/api/setup/scan', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: config.projectPath }),
        });
        const data = await r.json();
        const lines = [
          `**Project scan: \`${config.projectPath.split('/').filter(Boolean).pop()}\`**\n`,
          `- **Language:** ${data.primaryLanguage ?? '—'}`,
          `- **Framework:** ${data.framework ?? '—'}`,
          `- **Files:** ${data.files ?? '—'} (${data.testFiles ?? 0} test files)`,
          `- **Package:** ${data.packageName ?? '—'}`,
        ];
        if (data.topDirs?.length) lines.push(`- **Top dirs:** ${data.topDirs.slice(0, 6).join(', ')}`);
        if (data.entryPoints?.length) lines.push(`- **Entry points:** ${data.entryPoints.slice(0, 3).join(', ')}`);
        setMessages((m) => [...m, { role: 'assistant', content: lines.join('\n'), task: 'general', specialist: 'project-scan' }]);
      } catch {
        setMessages((m) => [...m, { role: 'assistant', content: 'Scan failed. Is the API running?' }]);
      }
      setIsThinking(false);
      return;
    }

    // ── /errors — fetch live error data from monitor ──────────────────────
    if (msg === '/errors' || msg.toLowerCase().includes('most recent and critical errors')) {
      try {
        const [countsRes, trackersRes] = await Promise.all([
          fetch('/api/monitor/counts'),
          fetch('/api/monitor/trackers?resolved=false&limit=5'),
        ]);
        const counts   = await countsRes.json();
        const trackers = await trackersRes.json();
        const lines = ['**Live error snapshot**\n'];

        const total = (counts.ERROR ?? 0) + (counts.FATAL ?? 0);
        lines.push(`- FATAL: ${counts.FATAL ?? 0}  ERROR: ${counts.ERROR ?? 0}  WARN: ${counts.WARN ?? 0}  INFO: ${counts.INFO ?? 0}`);
        lines.push('');

        if (trackers.trackers?.length) {
          lines.push('**Top open issues:**');
          for (const t of trackers.trackers.slice(0, 5)) {
            lines.push(`\n**[${t.severity}]** \`${t.errorName}\` · ${t.occurrences}× · layer: ${t.layer}`);
            lines.push(`> ${t.sampleMessage?.slice(0, 120) ?? '—'}`);
          }
        } else {
          lines.push(total === 0 ? '✓ No open errors.' : `${total} errors — run the monitor for details.`);
        }

        setMessages((m) => [...m, { role: 'assistant', content: lines.join('\n'), task: 'general', specialist: 'monitor-api' }]);
      } catch {
        setMessages((m) => [...m, { role: 'assistant', content: 'Could not fetch error data. Is the API running?' }]);
      }
      setIsThinking(false);
      return;
    }

    // ── /test — stream test run via SSE ──────────────────────────────────
    if ((msg === '/test' || msg.toLowerCase().startsWith('write comprehensive unit tests')) && config?.projectPath) {
      // First scan for test framework, then run
      try {
        const scanRes = await fetch('/api/setup/scan', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: config.projectPath }),
        });
        const scan = await scanRes.json();
        const framework = scan.testFramework ?? 'unknown';

        if (framework === 'unknown' || !scan.testFiles) {
          setMessages((m) => [...m, {
            role: 'assistant',
            content: `No test framework detected in \`${config.projectPath}\`.\n\nDetected: ${scan.primaryLanguage ?? '?'} / ${scan.framework ?? '?'}\n\nAsk me: "Write tests for this project" and I'll generate a test suite for you.`,
            task: 'general', specialist: 'project-scan',
          }]);
          setIsThinking(false);
          return;
        }

        // Stream the test run — append lines to the last assistant message
        const initContent = `**Running tests** · framework: \`${framework}\` · ${scan.testFiles} test files\n\n\`\`\``;
        let msgIdx = -1;
        setMessages((m) => {
          msgIdx = m.length;
          return [...m, { role: 'assistant' as const, content: initContent, task: 'general', specialist: 'test-runner' }];
        });

        const r = await fetch('/api/tests/run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectPath: config.projectPath, framework }),
        });

        if (!r.ok || !r.body) {
          setMessages((m) => m.map((msg, i) => i === msgIdx
            ? { ...msg, content: `Test runner not available yet.\n\nRun manually:\n\`\`\`\ncd ${config.projectPath}\n${framework === 'vitest' ? 'npx vitest run' : framework === 'jest' ? 'npx jest' : framework === 'pytest' ? 'pytest -v' : `${framework} test`}\n\`\`\`` }
            : msg));
          setIsThinking(false);
          return;
        }

        const reader = r.body.getReader();
        const dec = new TextDecoder();
        const outputLines: string[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const raw of dec.decode(value).split('\n')) {
            if (!raw.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(raw.slice(6));
              if (ev.type === 'line') {
                outputLines.push(ev.text);
                const preview = outputLines.slice(-20).join('\n');
                setMessages((m) => m.map((msg, i) =>
                  i === msgIdx ? { ...msg, content: `**Running tests** · \`${framework}\`\n\n\`\`\`\n${preview}\n\`\`\`` } : msg
                ));
              }
              if (ev.type === 'done') {
                const all = outputLines.join('\n');
                const status = ev.pass ? '✓ All tests passed' : '✗ Tests failed';
                setMessages((m) => m.map((msg, i) =>
                  i === msgIdx ? {
                    ...msg,
                    content: `**${status}** · \`${framework}\` · ${ev.durationMs}ms\n\n\`\`\`\n${all.slice(-1500)}\n\`\`\``,
                    task: 'general',
                  } : msg
                ));
              }
            } catch { /* skip */ }
          }
        }
      } catch {
        setMessages((m) => [...m, { role: 'assistant', content: 'Test run failed. Is the API running?' }]);
      }
      setIsThinking(false);
      return;
    }

    // ── /crawl — trigger RAG indexing ────────────────────────────────────
    if (msg.startsWith('/crawl') && config?.projectPath) {
      const projectPath = msg.replace('/crawl', '').trim() || config.projectPath;
      let msgIdx = -1;
      setMessages((m) => {
        msgIdx = m.length;
        return [...m, { role: 'assistant' as const, content: `**Indexing \`${projectPath}\` into Qdrant…**\n\n\`\`\``, task: 'general', specialist: 'rag-crawl' }];
      });

      try {
        const r = await fetch('/api/crawl', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectPath }),
        });
        if (!r.ok || !r.body) {
          setMessages((m) => m.map((x, i) => i === msgIdx ? { ...x, content: 'Qdrant not available. Start it with: `docker run -p 6333:6333 qdrant/qdrant`' } : x));
          setIsThinking(false);
          return;
        }
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        const log: string[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const raw of dec.decode(value).split('\n')) {
            if (!raw.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(raw.slice(6));
              if (ev.type === 'status' || ev.type === 'progress') {
                log.push(ev.message ?? `indexed ${ev.indexed ?? '?'}/${ev.total ?? '?'}`);
                setMessages((m) => m.map((x, i) => i === msgIdx ? { ...x, content: `**Indexing into Qdrant…**\n\n\`\`\`\n${log.slice(-12).join('\n')}\n\`\`\`` } : x));
              }
              if (ev.type === 'done') {
                setMessages((m) => m.map((x, i) => i === msgIdx ? { ...x, content: `**Indexed into Qdrant**\n\n\`\`\`\n${ev.message}\n\`\`\`\n\n/search now uses semantic RAG search.` } : x));
              }
              if (ev.type === 'error') {
                setMessages((m) => m.map((x, i) => i === msgIdx ? { ...x, content: `**Crawl error:** ${ev.message}` } : x));
              }
            } catch { /* skip */ }
          }
        }
      } catch {
        setMessages((m) => m.map((x, i) => i === msgIdx ? { ...x, content: 'Crawl failed. Is the API running?' } : x));
      }
      setIsThinking(false);
      return;
    }

    // ── /search <term> — RAG (Qdrant) first, ripgrep fallback ────────────
    const searchMatch = msg.match(/^\/search\s+(.+)$/i) ?? msg.match(/^Search for:\s+(.+)$/i);
    if (searchMatch && config?.projectPath) {
      const query = searchMatch[1].trim();
      try {
        // Try RAG semantic search first
        const ragRes = await fetch('/api/crawl/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query, projectPath: config.projectPath, limit: 12 }),
        });

        if (ragRes.ok) {
          const rag = await ragRes.json();
          if (rag.hits?.length > 0) {
            const lines = [`**Semantic search: \`${query}\`** — ${rag.total} matches (RAG)`];
            if (rag.summary) lines.push(`\n${rag.summary}`);
            lines.push('\n```');
            for (const h of rag.hits.slice(0, 10)) {
              lines.push(`${h.file}:${h.startLine}  [score: ${h.score}]`);
            }
            lines.push('```');
            setMessages((m) => [...m, { role: 'assistant', content: lines.join('\n'), task: 'general', specialist: 'rag-search' }]);
            setIsThinking(false);
            return;
          }
        }

        // Fallback to ripgrep
        const r = await fetch('/api/files/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query, projectPath: config.projectPath, maxResults: 20, summarize: true }),
        });
        const data = await r.json();
        const lines = [`**Search: \`${query}\`** — ${data.total} matches${data.truncated ? ' (truncated)' : ''}`];
        if (data.summary) lines.push(`\n${data.summary}`);
        if (data.matches?.length > 0) {
          lines.push('\n```');
          for (const m of data.matches.slice(0, 12)) {
            lines.push(`${m.file}:${m.line}  ${m.text.slice(0, 90)}`);
          }
          lines.push('```');
        } else {
          lines.push('\nNo matches found.');
        }
        setMessages((m) => [...m, { role: 'assistant', content: lines.join('\n'), task: 'general', specialist: 'file-search' }]);
      } catch {
        setMessages((m) => [...m, { role: 'assistant', content: 'File search failed. Is the API running?' }]);
      }
      setIsThinking(false);
      return;
    }

    // ── /git — git status + diff + log ───────────────────────────────────
    if ((msg === '/git' || msg === '/git status' || msg.startsWith('/git ')) && config?.projectPath) {
      try {
        const qs = `projectPath=${encodeURIComponent(config.projectPath)}`;
        const [statusRes, logRes] = await Promise.all([
          fetch(`/api/git/status?${qs}`),
          fetch(`/api/git/log?${qs}&limit=5`),
        ]);

        if (!statusRes.ok) {
          setMessages(m => [...m, { role: 'assistant', content: 'Not a git repo or git not available.', task: 'general', specialist: 'git' }]);
          setIsThinking(false);
          return;
        }

        const status = await statusRes.json();
        const log = await logRes.json();

        const lines: string[] = [`**Git status** · branch: \`${status.branch}\``];
        if (status.clean) {
          lines.push('\n> Working tree clean');
        } else {
          if (status.summary.staged > 0)    lines.push(`\n- **Staged:** ${status.summary.staged} file(s)`);
          if (status.summary.unstaged > 0)  lines.push(`- **Unstaged:** ${status.summary.unstaged} file(s)`);
          if (status.summary.untracked > 0) lines.push(`- **Untracked:** ${status.summary.untracked} file(s)`);
        }

        if (log.commits?.length) {
          lines.push('\n**Recent commits:**\n```');
          for (const c of log.commits.slice(0, 5)) {
            lines.push(`${c.shortHash}  ${c.message}  (${c.date})`);
          }
          lines.push('```');
        }

        // If diff requested
        if (msg.includes('diff') && !status.clean) {
          const diffRes = await fetch(`/api/git/diff?${qs}`);
          if (diffRes.ok) {
            const diffData = await diffRes.json();
            lines.push('\n**Changes:**\n```diff');
            lines.push(diffData.diff?.slice(0, 1500) ?? '');
            lines.push('```');
          }
        }

        setMessages(m => [...m, { role: 'assistant', content: lines.join('\n'), task: 'general', specialist: 'git' }]);
      } catch {
        setMessages(m => [...m, { role: 'assistant', content: 'Git command failed. Is the API running?' }]);
      }
      setIsThinking(false);
      return;
    }

    // ── /remember — save to project memory ───────────────────────────────
    if (msg.startsWith('/remember ')) {
      const content = msg.replace(/^\/remember\s*/i, '').trim();
      if (!content) {
        setMessages(m => [...m, { role: 'assistant', content: 'Usage: `/remember <fact or decision>` — saves to shared project memory' }]);
        setIsThinking(false);
        return;
      }
      const title = content.split('.')[0]?.slice(0, 80) ?? content.slice(0, 80);
      try {
        const r = await fetch('/api/memory', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'note', title, content, source: 'user', projectPath: config?.projectPath }),
        });
        const d = await r.json();
        setMessages(m => [...m, {
          role: 'assistant',
          content: d.ok ? `**Remembered** · \`${d.entry?.id?.slice(0, 8)}\`\n\n> ${title}` : `Memory save failed: ${d.error}`,
          task: 'general', specialist: 'memory',
        }]);
      } catch {
        setMessages(m => [...m, { role: 'assistant', content: 'Memory API unavailable.' }]);
      }
      setIsThinking(false);
      return;
    }

    // ── /memory — show current project memory ────────────────────────────
    if (msg === '/memory' || msg.startsWith('/memory ')) {
      const search = msg.replace('/memory', '').trim();
      try {
        const qs = new URLSearchParams();
        if (config?.projectPath) qs.set('projectPath', config.projectPath);
        if (search) qs.set('search', search);
        qs.set('limit', '20');
        const r = await fetch(`/api/memory?${qs}`);
        const d = await r.json();
        if (!d.entries?.length) {
          setMessages(m => [...m, { role: 'assistant', content: 'No memory entries yet. Use `/remember <fact>` to save something.', task: 'general' }]);
          setIsThinking(false);
          return;
        }
        const lines = [`**Project Memory** · ${d.total} entries${search ? ` matching "${search}"` : ''}\n`];
        for (const e of d.entries) {
          lines.push(`**[${e.type}]** ${e.title}${e.pinned ? ' 📌' : ''}`);
          lines.push(`> ${e.content.slice(0, 150)}`);
          if (e.tags.length) lines.push(`_tags: ${e.tags.join(', ')}_`);
          lines.push('');
        }
        setMessages(m => [...m, { role: 'assistant', content: lines.join('\n'), task: 'general', specialist: 'memory' }]);
      } catch {
        setMessages(m => [...m, { role: 'assistant', content: 'Memory API unavailable.' }]);
      }
      setIsThinking(false);
      return;
    }

    // ── /model — switch active model ──────────────────────────────────────
    if (msg.startsWith('/model')) {
      const modelArg = msg.replace('/model', '').trim();
      if (!modelArg) {
        // Show picker
        const list = AVAILABLE_MODELS.map(m =>
          `${m.id === activeModel ? '▶ ' : '  '}\`${m.id}\` — **${m.label}** · ${m.desc}`
        ).join('\n');
        setMessages(m => [...m, {
          role: 'assistant',
          content: `**Available models** (current: \`${activeModel}\`)\n\n${list}\n\nUsage: \`/model <id>\` — e.g. \`/model groq:deepseek-r1\``,
          task: 'general',
        }]);
        setIsThinking(false);
        return;
      }
      const found = AVAILABLE_MODELS.find(m => m.id === modelArg || m.label.toLowerCase().includes(modelArg.toLowerCase()));
      if (found) {
        setActiveModel(found.id);
        // Save to session config so mesh picks it up
        try {
          const [provider, model] = found.id.split(':');
          await fetch('/api/setup/config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ orchestrator: { provider, model } }),
          });
        } catch { /* best-effort */ }
        setMessages(m => [...m, {
          role: 'assistant',
          content: `**Model switched** → \`${found.id}\` (${found.label})\n\n${found.desc}`,
          task: 'general', specialist: found.id,
        }]);
      } else {
        setMessages(m => [...m, {
          role: 'assistant',
          content: `Unknown model \`${modelArg}\`. Use \`/model\` to list available models.`,
        }]);
      }
      setIsThinking(false);
      return;
    }

    // ── /notion — push to Notion ──────────────────────────────────────────
    if (msg.startsWith('/notion')) {
      const content = msg.replace(/^\/notion\s*(push:?\s*)?/i, '').trim()
        || messages.filter(m => m.role === 'assistant').slice(-1)[0]?.content?.slice(0, 2000)
        || 'Brain session export';
      try {
        const r = await fetch('/api/integrations/notion/create-page', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: `Brain: ${new Date().toLocaleDateString()}`, content }),
        });
        const d = await r.json();
        if (d.ok) {
          setMessages(m => [...m, { role: 'assistant', content: `**Sent to Notion** → [view page](${d.url})`, task: 'general', specialist: 'notion' }]);
        } else {
          setMessages(m => [...m, { role: 'assistant', content: `Notion error: ${d.error}\n\nConfigure Notion in the Integrations page.`, task: 'general' }]);
        }
      } catch {
        setMessages(m => [...m, { role: 'assistant', content: 'Notion not configured. Go to Integrations to set up.' }]);
      }
      setIsThinking(false);
      return;
    }

    // ── /slack — send to Slack ────────────────────────────────────────────
    if (msg.startsWith('/slack')) {
      const text = msg.replace(/^\/slack:?\s*/i, '').trim()
        || messages.filter(m => m.role === 'assistant').slice(-1)[0]?.content?.slice(0, 500)
        || 'Message from Lynx Brain';
      try {
        const r = await fetch('/api/integrations/slack/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        const d = await r.json();
        setMessages(m => [...m, {
          role: 'assistant',
          content: d.ok ? '**Sent to Slack** ✓' : `Slack error: ${d.error}\n\nConfigure Slack in the Integrations page.`,
          task: 'general', specialist: 'slack',
        }]);
      } catch {
        setMessages(m => [...m, { role: 'assistant', content: 'Slack not configured. Go to Integrations to set up.' }]);
      }
      setIsThinking(false);
      return;
    }

    // ── /design — design studio with multi-model routing ─────────────────
    if (msg.startsWith('/design ') || msg.startsWith('/design\n')) {
      const designPrompt = msg.replace(/^\/design\s*/i, '').trim();
      if (!designPrompt) {
        setMessages(m => [...m, { role: 'assistant', content: 'Usage: `/design <description>` — e.g. `/design a dark card with title, tags, and a CTA button in React + Tailwind`' }]);
        setIsThinking(false);
        return;
      }

      setMessages(m => [...m, { role: 'assistant', content: `**Design Studio** · generating component…\n\nPrompt: _${designPrompt}_`, task: 'code-easy', specialist: 'stitch' }]);
      const lastMsgIdx = messages.length; // index of the just-added message

      try {
        const r = await fetch('/api/integrations/stitch/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            designContext: designPrompt,
            framework: 'react',
            styleSystem: 'tailwind',
          }),
        });
        const d = await r.json();
        const code = d.code ?? `Error: ${d.error ?? 'generation failed'}`;
        const source = d.source === 'stitch' ? 'Stitch AI' : 'Lynx LLM';
        setMessages(m => m.map((x, i) => i === lastMsgIdx ? {
          ...x,
          content: `**Design Studio** · ${source} · \`${d.source ?? 'llm'}\`\n\n${designPrompt}\n\n\`\`\`tsx\n${code}\n\`\`\``,
          hasCodeProposal: true,
        } : x));
      } catch {
        setMessages(m => m.map((x, i) => i === lastMsgIdx ? { ...x, content: 'Design generation failed. Is the API running?' } : x));
      }
      setIsThinking(false);
      return;
    }

    // Build history (skip system messages for the request body)
    const history = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    // Fetch RAG + memory context in parallel
    const [ragContext, memoryContext] = await Promise.all([
      fetchRagContext(msg),
      fetchMemoryContext(),
    ]);

    try {
      const res = await fetch('/api/mesh/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: msg,
          sessionId,
          systemContext: buildSystemContext(ragContext, memoryContext, activeModel),
          history,
          ...(activeModel !== 'default' ? { model: activeModel } : {}),
        }),
      });

      if (!res.ok) {
        // fallback to old /api/chat if mesh not wired
        const fallback = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: msg, history }),
        });
        const data = await fallback.json();
        setMessages((m) => [...m, {
          role: 'assistant',
          content: data.content ?? data.error ?? 'No response.',
          thinking: data.thinking,
        }]);
        return;
      }

      const data = await res.json();
      const content = data.content ?? data.error ?? 'No response.';
      const hasCodeProposal = detectsCodeProposal(content);

      const newMessages = [...messages, { role: 'user' as const, content: msg }, {
        role: 'assistant' as const,
        content,
        thinking:      data.thinking,
        task:          data.task,
        conductor:     data.conductor,
        specialist:    data.specialist,
        executionMode: data.executionMode,
        stepsLog:      data.stepsLog,
        isBottleneck:  data.isBottleneck,
        bottleneck:    data.bottleneck,
        hasCodeProposal,
      }];

      setMessages((m) => [...m, {
        role: 'assistant',
        content,
        thinking:      data.thinking,
        task:          data.task,
        conductor:     data.conductor,
        specialist:    data.specialist,
        executionMode: data.executionMode,
        stepsLog:      data.stepsLog,
        isBottleneck:  data.isBottleneck,
        bottleneck:    data.bottleneck,
        hasCodeProposal,
      }]);

      // Auto-extract memory from conversation every 5 messages (best-effort)
      if (newMessages.filter(m => m.role === 'user').length % 5 === 0 && config?.projectPath) {
        fetch('/api/memory/extract', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            conversation: newMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
            projectPath: config.projectPath,
          }),
        }).catch(() => { /* best-effort */ });
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Connection error. Is the API running on :4000?' }]);
    } finally {
      setIsThinking(false);
    }
  };

  const isEmpty = messages.length === 0;
  const orchestratorLabel = config?.orchestrator?.provider ?? config?.llm?.mode ?? '—';
  const executorLabel = config?.executor?.bundleId ?? (config?.executor?.provider === 'ollama' ? 'ollama' : null);

  return (
    <div className="flex flex-col" style={{ height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div
        className="px-6 py-3 flex-shrink-0 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <h1 className="text-sm font-semibold">brain</h1>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            AI engineering partner · orchestrator → executor mesh · always shows reasoning
          </p>
        </div>
        <div className="flex items-center gap-2">
          {orchestratorLabel !== '—' && (
            <span
              className="badge text-xs font-mono"
              style={{ background: 'var(--purple-lo)', color: 'var(--purple-hi)', border: '1px solid var(--purple)40' }}
            >
              ◈ {orchestratorLabel}
            </span>
          )}
          {executorLabel && (
            <span
              className="badge text-xs font-mono"
              style={{ background: 'var(--teal-lo)', color: 'var(--teal)', border: '1px solid rgba(29,184,124,0.3)' }}
            >
              ⚙ {executorLabel}
            </span>
          )}
          {/* Clear history */}
          {messages.length > 0 && (
            <button
              className="badge text-xs font-mono cursor-pointer transition-opacity hover:opacity-80"
              style={{ background: 'var(--surface2)', color: 'var(--text-mute)', border: '1px solid var(--border)' }}
              title="Clear conversation history"
              onClick={() => {
                setMessages([]);
                localStorage.removeItem(HISTORY_KEY);
              }}
            >
              ✕ clear
            </button>
          )}
          {/* Model switcher */}
          <div className="relative">
            <button
              className="badge text-xs font-mono cursor-pointer"
              style={{ background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}
              onClick={() => setShowModelPicker(!showModelPicker)}
              title="Switch model"
            >
              ⬡ {AVAILABLE_MODELS.find(m => m.id === activeModel)?.label.split(' / ')[1] ?? activeModel}
            </button>
            <AnimatePresence>
              {showModelPicker && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute right-0 top-full mt-1 rounded overflow-hidden z-50"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 260, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
                >
                  {AVAILABLE_MODELS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setActiveModel(m.id);
                        setShowModelPicker(false);
                        const [provider, model] = m.id.split(':');
                        fetch('/api/setup/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orchestrator: { provider, model } }) }).catch(() => {});
                        setMessages(msgs => [...msgs, { role: 'assistant', content: `**Model switched** → \`${m.id}\` (${m.label})`, task: 'general' }]);
                      }}
                      className="w-full flex items-start gap-3 px-4 py-2.5 text-left text-xs transition-all"
                      style={{ borderBottom: '1px solid var(--border)', background: m.id === activeModel ? 'var(--overlay)' : 'transparent' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--overlay)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = m.id === activeModel ? 'var(--overlay)' : 'transparent'}
                    >
                      <div>
                        <p className="font-mono font-semibold" style={{ color: m.id === activeModel ? 'var(--purple-hi)' : 'var(--text)' }}>
                          {m.id === activeModel ? '▶ ' : ''}{m.label}
                        </p>
                        <p style={{ color: 'var(--text-mute)' }}>{m.desc}</p>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <span className="badge badge-info text-xs">chain-of-thought on</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-5" style={{ minHeight: 0 }}>
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 font-mono text-xl"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border-lit)', color: 'var(--purple-hi)' }}
            >
              ◈
            </div>
            <h2 className="font-semibold mb-1">Ask me anything</h2>
            <p className="text-xs mb-2 text-center max-w-xs" style={{ color: 'var(--text-dim)' }}>
              Each task is routed to the right specialist — reasoner, coder, or general — with full trace.
            </p>
            {config?.projectPath && (
              <p className="text-xs mb-6 font-mono" style={{ color: 'var(--text-mute)' }}>
                ◦ {config.projectPath.split('/').filter(Boolean).pop() ?? config.projectPath}
              </p>
            )}
            <div className="w-full max-w-2xl space-y-4">
              {SUGGESTION_GROUPS.map((group) => (
                <div key={group.label}>
                  <p
                    className="text-xs font-mono mb-2 uppercase tracking-widest"
                    style={{ color: group.color, fontSize: 10 }}
                  >
                    {group.label}
                  </p>
                  <div className="space-y-1.5">
                    {group.items.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="w-full text-left px-4 py-2.5 rounded text-xs transition-all"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.borderColor = group.color;
                          (e.currentTarget as HTMLElement).style.color = 'var(--text)';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                          (e.currentTarget as HTMLElement).style.color = 'var(--text-dim)';
                        }}
                      >
                        <span className="font-mono mr-2" style={{ color: group.color }}>→</span>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl">
            {messages.map((msg, i) => (
              msg.role === 'system' ? null : (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <span className="mr-2 mt-2 font-mono text-xs flex-shrink-0" style={{ color: 'var(--purple-hi)' }}>
                      ◈
                    </span>
                  )}
                  <div
                    className="max-w-xl rounded px-4 py-3 text-xs"
                    style={
                      msg.role === 'user'
                        ? { background: 'var(--surface2)', border: '1px solid var(--border-lit)', color: 'var(--text)' }
                        : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
                    }
                  >
                    {/* Thinking toggle */}
                    {msg.thinking && (
                      <button
                        onClick={() => setExpandedThinking(expandedThinking === i ? null : i)}
                        className="flex items-center gap-1.5 mb-2 text-xs transition-opacity"
                        style={{ color: 'var(--text-mute)', opacity: 0.7 }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
                      >
                        <span className="font-mono">{expandedThinking === i ? '▼' : '▶'}</span>
                        <span>thinking</span>
                      </button>
                    )}
                    <AnimatePresence>
                      {msg.thinking && expandedThinking === i && (
                        <motion.pre
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mb-3 p-2 rounded overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed"
                          style={{ background: 'var(--bg)', color: 'var(--purple-hi)', border: '1px solid var(--border)' }}
                        >
                          {msg.thinking}
                        </motion.pre>
                      )}
                    </AnimatePresence>

                    <div className="leading-relaxed text-xs">
                      {msg.role === 'assistant'
                        ? renderMarkdown(msg.content)
                        : <span className="whitespace-pre-wrap">{msg.content}</span>
                      }
                    </div>

                    {/* Routing metadata */}
                    {msg.role === 'assistant' && <RoutingBadge msg={msg} />}

                    {/* Intelligent model suggestion */}
                    {msg.role === 'assistant' && (
                      <ModelSuggestionChip
                        activeModel={activeModel}
                        task={msg.task}
                        onSwitch={(id) => {
                          const found = AVAILABLE_MODELS.find(m => m.id === id);
                          if (!found) return;
                          setActiveModel(id);
                          fetch('/api/setup/config', {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ orchestrator: { provider: id.split(':')[0], model: id.split(':')[1] } }),
                          }).catch(() => {});
                          setMessages(m => [...m, {
                            role: 'assistant',
                            content: `**Model switched** → \`${id}\` (${found.label})\n\n${found.desc}\n\n_Switched based on task type — ask your next question._`,
                            task: 'general',
                          }]);
                        }}
                      />
                    )}

                    {/* HITL — send code proposal for approval */}
                    {msg.role === 'assistant' && msg.hasCodeProposal && (
                      <div className="mt-3 flex items-center gap-2">
                        {!msg.hitlStatus ? (
                          <button
                            onClick={() => {
                              const userMsg = messages[i - 1]?.content ?? '';
                              sendForApproval(i, userMsg);
                            }}
                            className="font-mono text-xs px-3 py-1 rounded transition-all"
                            style={{
                              background: 'var(--teal-lo)',
                              color: 'var(--teal)',
                              border: '1px solid rgba(29,184,124,0.4)',
                            }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(29,184,124,0.2)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--teal-lo)'}
                          >
                            → send for approval
                          </button>
                        ) : msg.hitlStatus === 'pending' && msg.hitlId ? (
                          <span
                            className="font-mono text-xs px-2 py-0.5 rounded"
                            style={{ background: 'var(--amber-lo)', color: 'var(--amber)', border: '1px solid rgba(212,160,23,0.3)' }}
                          >
                            ⏳ pending approval · {msg.hitlId.slice(-8)}
                          </span>
                        ) : msg.hitlStatus === 'approved' ? (
                          <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: 'var(--teal-lo)', color: 'var(--teal)', border: '1px solid rgba(29,184,124,0.3)' }}>
                            ✓ approved
                          </span>
                        ) : msg.hitlStatus === 'rejected' ? (
                          <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: 'var(--red-lo)', color: 'var(--red)', border: '1px solid rgba(224,85,85,0.3)' }}>
                            ✗ rejected
                          </span>
                        ) : msg.hitlStatus === 'pending' ? (
                          <span className="font-mono text-xs" style={{ color: 'var(--text-mute)' }}>sending…</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <span className="ml-2 mt-2 font-mono text-xs flex-shrink-0" style={{ color: 'var(--text-dim)' }}>
                      you
                    </span>
                  )}
                </motion.div>
              )
            ))}

            {isThinking && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <span className="mr-2 mt-2 font-mono text-xs" style={{ color: 'var(--purple-hi)' }}>◈</span>
                <div
                  className="rounded px-4 py-3 flex items-center gap-2"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  {[0, 0.15, 0.3].map((d, idx) => (
                    <motion.span
                      key={idx}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: 'var(--purple)' }}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 0.9, delay: d, repeat: Infinity }}
                    />
                  ))}
                  <span className="text-xs font-mono ml-1" style={{ color: 'var(--text-mute)' }}>routing…</span>
                </div>
              </motion.div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div
        className="px-6 py-4 flex-shrink-0 relative"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        <AnimatePresence>
          {showSlash && (
            <SlashMenu query={input} onSelect={handleSlashSelect} />
          )}
        </AnimatePresence>

        <div
          className="flex items-center gap-3 rounded px-3 py-2"
          style={{ background: 'var(--bg)', border: `1px solid ${input.startsWith('/') ? 'var(--purple)' : 'var(--border-lit)'}` }}
        >
          <span className="font-mono text-xs flex-shrink-0" style={{ color: input.startsWith('/') ? 'var(--purple-hi)' : 'var(--purple)' }}>›</span>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}
            placeholder="Ask anything… or type / for commands"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setShowSlash(false); return; }
              if (e.key === 'Enter' && !e.shiftKey) { setShowSlash(false); send(); }
            }}
            disabled={isThinking}
          />
          <span className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>↵</span>
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          <p className="text-xs font-mono flex-1" style={{ color: 'var(--text-mute)' }}>
            session · {sessionId.slice(-8)} · {messages.filter(m => m.role !== 'system').length} msgs
            {' · '}
            <span style={{ opacity: 0.5 }}>/ for commands</span>
          </p>
          <span className="text-xs font-mono" style={{ color: activeModel !== 'default' ? 'var(--amber)' : 'var(--text-mute)', fontSize: 10 }}>
            model: {activeModel}
          </span>
        </div>
      </div>
    </div>
  );
}

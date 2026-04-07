import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Palette — light mode, white/grey background, forest green text ───────────
const G = {
  bg:        '#ffffff',   // pure white
  surface:   '#f4f7f5',   // very light grey-green tint
  surface2:  '#eaf0ec',   // slightly deeper for inputs/cards
  border:    '#d5e3da',
  borderLit: '#b8cebd',
  text:      '#1a3d28',   // deep forest green — main text
  dim:       '#3a6b4a',   // medium green — secondary text
  mute:      '#7aaa88',   // muted sage — tertiary / placeholders
  green:     '#2b7a4a',   // forest green — CTAs, accents
  greenHi:   '#3da066',   // brighter green — hover states
  greenLo:   'rgba(43,122,74,0.09)',
  teal:      '#1a8c6e',
  stone:     '#7a6a5a',
  beige:     '#b8952a',
  red:       '#c0544a',
  amber:     '#b8891a',
};

// ─── Lynx Icon ───────────────────────────────────────────────────────────────
function LynxIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <polygon points="8,20 14,4 20,18"  fill="url(#li-g)" opacity="0.95" />
      <polygon points="40,20 34,4 28,18" fill="url(#li-g)" opacity="0.95" />
      <polygon points="10,18 14,7 18,17" fill={G.bg} opacity="0.55" />
      <polygon points="38,18 34,7 30,17" fill={G.bg} opacity="0.55" />
      <path d="M8 20 Q6 36 24 44 Q42 36 40 20 Q34 14 24 14 Q14 14 8 20Z" fill="url(#li-g)" />
      <ellipse cx="17" cy="26" rx="3.5" ry="2.5" fill={G.bg} />
      <ellipse cx="31" cy="26" rx="3.5" ry="2.5" fill={G.bg} />
      <ellipse cx="17" cy="26" rx="1.4" ry="1.9" fill="url(#li-e)" />
      <ellipse cx="31" cy="26" rx="1.4" ry="1.9" fill="url(#li-e)" />
      <path d="M22 33 L24 31 L26 33 L24 35Z" fill={G.bg} opacity="0.7" />
      <defs>
        <linearGradient id="li-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={G.greenHi} />
          <stop offset="100%" stopColor={G.green} />
        </linearGradient>
        <linearGradient id="li-e" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={G.greenHi} />
          <stop offset="100%" stopColor={G.green} />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Typewriter ──────────────────────────────────────────────────────────────
function useTypewriter(words: string[], typeMs = 90, deleteMs = 50, pauseMs = 1600) {
  const [display, setDisplay] = useState('');
  const [idx, setIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = words[idx];
    let t: ReturnType<typeof setTimeout>;
    if (!deleting) {
      if (display.length < word.length) {
        t = setTimeout(() => setDisplay(word.slice(0, display.length + 1)), typeMs);
      } else {
        t = setTimeout(() => setDeleting(true), pauseMs);
      }
    } else {
      if (display.length > 0) {
        t = setTimeout(() => setDisplay(display.slice(0, -1)), deleteMs);
      } else {
        setDeleting(false);
        setIdx(i => (i + 1) % words.length);
      }
    }
    return () => clearTimeout(t);
  }, [display, deleting, idx, words, typeMs, deleteMs, pauseMs]);

  return display;
}

// ─── Hex grid canvas background ─────────────────────────────────────────────
function HexGrid() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      draw();
    };
    const draw = () => {
      const w = canvas.width, h = canvas.height;
      const size = 38;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(30,100,60,0.08)';
      ctx.lineWidth = 0.6;
      const cols = Math.ceil(w / (size * Math.sqrt(3))) + 2;
      const rows = Math.ceil(h / (size * 1.5)) + 2;
      for (let r = -1; r < rows; r++) {
        for (let c = -1; c < cols; c++) {
          const x = c * size * Math.sqrt(3) + (r % 2) * size * (Math.sqrt(3) / 2);
          const y = r * size * 1.5;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            const px = x + (size - 2) * Math.cos(a);
            const py = y + (size - 2) * Math.sin(a);
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    return () => ro.disconnect();
  }, []);

  return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

// ─── Sphere node data ────────────────────────────────────────────────────────
// Positions as % of hero container (left%, top%)
const NODES = [
  {
    id: 'conductor',
    label: 'CONDUCTOR',
    role: 'Orchestration Engine',
    desc: 'Routes every task to the right specialist. The central brain of the mesh.',
    stats: ['Latency: 12ms', 'Task: Orchestration', 'Auto-Scaling: Active', 'Throughput: 95%'],
    cx: 50, cy: 48,   // center
    r: 90,
    color: G.green,
    glow:  'rgba(34,197,94,0.55)',
    glowOuter: 'rgba(34,197,94,0.18)',
  },
  {
    id: 'general',
    label: 'GENERAL',
    role: 'General Intelligence',
    desc: 'Handles chat, docs, Q&A. Fast and light — Llama 3 or Gemma.',
    stats: ['Model: Llama 3.1 8B', 'Context: 128k', 'Speed: 45 tok/s'],
    cx: 30, cy: 20,
    r: 54,
    color: G.stone,
    glow:  'rgba(168,162,158,0.45)',
    glowOuter: 'rgba(168,162,158,0.15)',
  },
  {
    id: 'coder',
    label: 'CODER',
    role: 'Code Specialist',
    desc: 'Fixes bugs, writes tests, generates PRs. Runs 100% locally.',
    stats: ['Model: Qwen 2.5 Coder', 'Context: 128k', 'Local: Yes'],
    cx: 73, cy: 28,
    r: 62,
    color: G.teal,
    glow:  'rgba(29,184,124,0.5)',
    glowOuter: 'rgba(29,184,124,0.15)',
  },
  {
    id: 'auto',
    label: 'AUTO',
    role: 'Autocomplete',
    desc: 'Inline completions as you type. Sub-20ms, always local.',
    stats: ['Model: Qwen 2.5 1.5B', 'Latency: <18ms', 'Context: 8k'],
    cx: 22, cy: 66,
    r: 44,
    color: G.greenHi,
    glow:  'rgba(74,222,128,0.45)',
    glowOuter: 'rgba(74,222,128,0.12)',
  },
  {
    id: 'reasoner',
    label: 'REASONER',
    role: 'Deep Reasoning',
    desc: 'Complex planning, architecture, math. DeepSeek R1 distill.',
    stats: ['Model: DeepSeek R1 7B', 'Context: 64k', 'Chain-of-thought: On'],
    cx: 68, cy: 68,
    r: 48,
    color: G.amber,
    glow:  'rgba(212,160,23,0.5)',
    glowOuter: 'rgba(212,160,23,0.14)',
  },
];

// Edges (which nodes connect)
const EDGES: [string, string][] = [
  ['conductor', 'general'],
  ['conductor', 'coder'],
  ['conductor', 'auto'],
  ['conductor', 'reasoner'],
];

// ─── Arc SVG layer ───────────────────────────────────────────────────────────
function ArcLayer({ hovered }: { hovered: string | null }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      <defs>
        <filter id="arc-glow">
          <feGaussianBlur stdDeviation="0.4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {EDGES.map(([aId, bId]) => {
        const a = NODES.find(n => n.id === aId)!;
        const b = NODES.find(n => n.id === bId)!;
        const active = hovered === aId || hovered === bId;
        const nodeColor = b.color;
        // Slight quadratic curve: midpoint offset
        const mx = (a.cx + b.cx) / 2 + (Math.random() > 0.5 ? 3 : -3);
        const my = (a.cy + b.cy) / 2;
        const pathD = `M ${a.cx} ${a.cy} Q ${mx} ${my} ${b.cx} ${b.cy}`;
        return (
          <g key={`${aId}-${bId}`} filter="url(#arc-glow)">
            {/* Base dim line */}
            <path
              d={pathD}
              stroke={nodeColor}
              strokeWidth={active ? 0.4 : 0.2}
              strokeOpacity={active ? 0.7 : 0.25}
              fill="none"
            />
            {/* Animated flowing packet */}
            <path
              d={pathD}
              stroke={nodeColor}
              strokeWidth="0.5"
              strokeOpacity="0.9"
              fill="none"
              strokeDasharray="4 96"
              strokeDashoffset="100"
              style={{ animation: `flowArc ${2.5 + EDGES.indexOf([aId, bId] as [string,string]) * 0.4}s linear infinite` }}
            />
          </g>
        );
      })}
      <style>{`
        @keyframes flowArc {
          from { stroke-dashoffset: 100; }
          to   { stroke-dashoffset: -100; }
        }
      `}</style>
    </svg>
  );
}

// ─── Glass Sphere ────────────────────────────────────────────────────────────
function Sphere({ node, hovered, onHover }: {
  node: typeof NODES[number];
  hovered: string | null;
  onHover: (id: string | null) => void;
}) {
  const isHov = hovered === node.id;
  const dim   = node.r * 2;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${node.cx}%`,
        top:  `${node.cy}%`,
        transform: 'translate(-50%, -50%)',
        width:  dim,
        height: dim,
        cursor: 'pointer',
        zIndex: isHov ? 200 : 10,
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Outer glow ring */}
      <motion.div
        animate={{ scale: isHov ? 1.18 : 1, opacity: isHov ? 1 : 0.7 }}
        transition={{ duration: 0.3 }}
        style={{
          position: 'absolute', inset: -node.r * 0.35,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${node.glowOuter} 0%, transparent 70%)`,
        }}
      />
      {/* Glass sphere body */}
      <motion.div
        animate={{
          y: [0, node.r * -0.08, 0],
          scale: isHov ? 1.1 : 1,
        }}
        transition={{
          y: { repeat: Infinity, duration: 3 + (node.cx % 2), ease: 'easeInOut' },
          scale: { duration: 0.25 },
        }}
        style={{
          width: '100%', height: '100%',
          borderRadius: '50%',
          background: `
            radial-gradient(
              circle at 32% 28%,
              rgba(255,255,255,0.6) 0%,
              rgba(255,255,255,0.25) 22%,
              ${node.color}55 50%,
              ${node.color}22 75%,
              rgba(0,0,0,0.06) 100%
            )
          `,
          border: `1px solid ${node.color}55`,
          boxShadow: isHov
            ? `inset 0 1px 0 rgba(255,255,255,0.7), 0 0 ${dim * 0.5}px ${node.glow}, 0 0 ${dim * 0.9}px ${node.glowOuter}`
            : `inset 0 1px 0 rgba(255,255,255,0.5), 0 0 ${dim * 0.25}px ${node.glow}`,
        }}
      >
        {/* Specular highlight */}
        <div style={{
          position: 'absolute',
          top: '14%', left: '20%',
          width: '35%', height: '22%',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(255,255,255,0.25) 0%, transparent 100%)',
          transform: 'rotate(-20deg)',
        }} />
      </motion.div>

      {/* Tooltip */}
      <AnimatePresence>
        {isHov && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            style={{
              position: 'absolute',
              top: '50%',
              left: node.cx > 55 ? 'auto' : '110%',
              right: node.cx > 55 ? '110%' : 'auto',
              transform: 'translateY(-50%)',
              zIndex: 50,
              background: 'rgba(255,255,255,0.97)',
              border: `1px solid ${G.borderLit}`,
              backdropFilter: 'blur(20px)',
              borderRadius: 8,
              padding: '10px 14px',
              minWidth: 200,
              boxShadow: `0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px ${node.color}22`,
              pointerEvents: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: node.color, display: 'inline-block', flexShrink: 0,
              }} />
              <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, letterSpacing: '0.15em', color: node.color }}>
                SPHERE: {node.label}
              </span>
            </div>
            <p style={{ fontSize: 11, fontWeight: 600, color: G.text, marginBottom: 4 }}>{node.role}</p>
            <p style={{ fontSize: 10, color: G.dim, lineHeight: 1.5, marginBottom: 6 }}>{node.desc}</p>
            {node.stats.map(s => (
              <p key={s} style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: G.mute, lineHeight: 1.7 }}>
                · {s}
              </p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Quickstart questionnaire panel ─────────────────────────────────────────
const PROFILES = [
  { id: 'coding-heavy', icon: '▸', label: 'Mostly coding',        desc: 'Code, debug, refactor',             models: 'Qwen 2.5 Coder + DeepSeek R1' },
  { id: 'general-use',  icon: '◈', label: 'Writing & chat',       desc: 'Docs, Q&A, analysis',               models: 'Llama 3.1 8B + reasoning model' },
  { id: 'balanced',     icon: '◎', label: 'Balanced',             desc: 'Mix of coding + general tasks',     models: 'Coder + general model, day-to-day' },
  { id: 'research',     icon: '◉', label: 'Research & analysis',  desc: 'Deep dives, long documents',        models: 'DeepSeek R1 + Llama 3.1 128k ctx' },
  { id: 'creative',     icon: '◐', label: 'Creative work',        desc: 'Writing, music theory, art',        models: 'Gemma 3 + LLaVA multimodal' },
  { id: 'minimal',      icon: '○', label: 'Minimal footprint',    desc: 'Low RAM, older hardware',           models: 'Sub-5GB total — smallest that work' },
];

const PROVIDERS = [
  { id: 'groq',        label: 'Groq',             sub: 'Free · llama-3.3-70b · fastest cloud' },
  { id: 'claude-api',  label: 'Anthropic Claude', sub: 'claude-3-5-sonnet · best reasoning' },
  { id: 'openai',      label: 'OpenAI',           sub: 'gpt-4o · widely supported' },
  { id: 'ollama',      label: 'Ollama (local)',   sub: '100% local · free · no API key' },
  { id: 'none',        label: 'Skip for now',     sub: 'Configure AI later in settings' },
];

function QuickstartPanel({ go }: { go: () => void }) {
  const [profile, setProfile] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  return (
    <div style={{
      borderRadius: 10, padding: '20px 22px',
      background: G.bg, border: `1px solid ${G.borderLit}`,
      display: 'flex', flexDirection: 'column', gap: 0,
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${G.green}28, ${G.greenHi}14)`, border: `1px solid ${G.green}35` }}>
          <LynxIcon size={17} />
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: G.text, margin: 0 }}>Quick setup</p>
          <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: G.mute, margin: 0 }}>takes ~30 seconds · full wizard runs next</p>
        </div>
      </div>

      {/* Step 1: Use-case */}
      <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: G.mute, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
        1 · What will you use Lynx for?
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
        {PROFILES.map(p => {
          const active = profile === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setProfile(p.id)}
              style={{
                textAlign: 'left', padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
                background: active ? G.greenLo : G.surface,
                border: `1px solid ${active ? G.green : G.border}`,
                transition: 'all 0.15s',
                position: 'relative',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = G.borderLit; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = G.border; }}
            >
              {active && (
                <span style={{
                  position: 'absolute', top: 5, right: 6,
                  width: 14, height: 14, borderRadius: '50%',
                  background: G.green, color: '#fff',
                  fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>✓</span>
              )}
              <span style={{ fontSize: 12, color: active ? G.green : G.mute, display: 'block', marginBottom: 2 }}>{p.icon}</span>
              <p style={{ fontSize: 11, fontWeight: 600, color: active ? G.text : G.dim, margin: 0, lineHeight: 1.3 }}>{p.label}</p>
              <p style={{ fontSize: 10, color: G.mute, margin: 0, marginTop: 2, lineHeight: 1.3 }}>{p.desc}</p>
              {active && (
                <p style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: G.green, margin: 0, marginTop: 4, lineHeight: 1.4 }}>
                  {p.models}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Step 2: AI provider */}
      <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: G.mute, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
        2 · Orchestrator (cloud brain)
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 18 }}>
        {PROVIDERS.map(p => {
          const active = provider === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setProvider(p.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                background: active ? G.greenLo : 'transparent',
                border: `1px solid ${active ? G.green : G.border}`,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = G.borderLit; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = G.border; }}
            >
              <span style={{
                width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${active ? G.green : G.borderLit}`,
                background: active ? G.green : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {active && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />}
              </span>
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: active ? G.text : G.dim, margin: 0 }}>{p.label}</p>
                <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: G.mute, margin: 0 }}>{p.sub}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* CTA */}
      <button
        onClick={go}
        disabled={!profile || !provider}
        style={{
          width: '100%', padding: '11px', borderRadius: 7,
          background: profile && provider ? G.green : G.surface2,
          color: profile && provider ? '#fff' : G.mute,
          border: `1px solid ${profile && provider ? G.green : G.border}`,
          fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
          cursor: profile && provider ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { if (profile && provider) (e.currentTarget as HTMLElement).style.background = G.greenHi; }}
        onMouseLeave={e => { if (profile && provider) (e.currentTarget as HTMLElement).style.background = G.green; }}
      >
        {profile && provider ? 'Continue to full setup wizard →' : 'Select a profile and provider above'}
      </button>
      <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: G.mute, textAlign: 'center', marginTop: 8, margin: '8px 0 0' }}>
        Full wizard covers: project folder · model bundles · alerts
      </p>
    </div>
  );
}

// ─── What We Do cards ────────────────────────────────────────────────────────
const FEATURES = [
  { num: '01', title: 'Error Intelligence',     desc: 'AI fingerprints and groups errors, finds root cause, explains in plain English.' },
  { num: '02', title: 'Autonomous Code Fixes',  desc: 'Broken tests, failing builds, CVEs — Lynx fixes them and opens a PR for approval.' },
  { num: '03', title: 'Security at Every Layer',desc: 'SAST, CVE detection, runtime threat monitoring — all wired into your dev loop.' },
  { num: '04', title: 'Human-in-the-Loop',      desc: 'Every AI change goes through a diff editor. You approve before anything merges.' },
];

const TYPEWRITER_WORDS = ['build', 'release', 'protect', 'monitor', 'scale'];

// ─── Landing Page ─────────────────────────────────────────────────────────────
export function LynxLanding({ onStart }: { onStart?: () => void }) {
  const go = onStart ?? (() => {});
  const [hovered, setHovered] = useState<string | null>(null);
  const typeword = useTypewriter(TYPEWRITER_WORDS);

  return (
    <main style={{ background: G.bg, color: G.text, overflowX: 'hidden' }}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px',
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(18px)',
        borderBottom: `1px solid ${G.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LynxIcon size={26} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Lynx</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {['Documentation', 'Community'].map(l => (
            <a key={l} href="#" style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: G.dim, textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = G.text)}
              onMouseLeave={e => (e.currentTarget.style.color = G.dim)}>{l}</a>
          ))}
          <a href="#" style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: G.dim, textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.color = G.text)}
            onMouseLeave={e => (e.currentTarget.style.color = G.dim)}>Sign In</a>
          <button onClick={go} style={{
            fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
            padding: '6px 16px', borderRadius: 6,
            background: G.green, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600,
          }}
            onMouseEnter={e => (e.currentTarget.style.background = G.greenHi)}
            onMouseLeave={e => (e.currentTarget.style.background = G.green)}>
            Get Started
          </button>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        paddingTop: 52,
        overflow: 'hidden',
      }}>
        {/* Hex grid background */}
        <HexGrid />

        {/* Radial vignette — keeps text readable */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse 75% 60% at 50% 48%, transparent 20%, ${G.bg} 85%)`,
        }} />

        {/* ── Sphere network ── */}
        <div style={{ position: 'absolute', inset: 0, top: 52 }}>
          {/* Arc connections */}
          <ArcLayer hovered={hovered} />
          {/* Sphere nodes */}
          {NODES.map(node => (
            <Sphere key={node.id} node={node} hovered={hovered} onHover={setHovered} />
          ))}
        </div>

        {/* ── Text + CTA ── */}
        <div style={{
          position: 'relative', zIndex: 30,
          textAlign: 'center',
          padding: '0 16px',
          pointerEvents: 'none',
        }}>
          {/* YC badge */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '4px 14px', borderRadius: 20,
              background: G.greenLo,
              border: `1px solid rgba(34,197,94,0.22)`,
              color: G.greenHi,
              fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
              marginBottom: 28,
              pointerEvents: 'auto',
            }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: G.green, display: 'inline-block' }} />
            Backed by Y Combinator &amp; Renaissance Technologies
          </motion.div>

          {/* LYNX wordmark */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            style={{
              fontSize: 'clamp(72px, 14vw, 140px)',
              fontWeight: 900, letterSpacing: '-0.02em',
              lineHeight: 1, color: G.text,
              textShadow: `0 0 80px rgba(43,122,74,0.18)`,
              marginBottom: 8,
            }}>
            LYNX
          </motion.h1>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
            style={{
              fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.22em', color: G.dim,
              marginBottom: 20,
            }}>
            AI MESH · DEVOPS · OPEN SOURCE
          </motion.p>

          {/* Typewriter */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
            style={{
              fontSize: 16, color: G.dim,
              marginBottom: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
            <span>The platform that helps you</span>
            <span style={{ color: G.greenHi, fontWeight: 600, minWidth: 90, textAlign: 'left' }}>
              {typeword}
              <span style={{
                display: 'inline-block', width: 2, height: 16, marginLeft: 2,
                background: G.greenHi, verticalAlign: 'middle',
                animation: 'blink 1s step-end infinite',
              }} />
            </span>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65 }}
            style={{ display: 'flex', gap: 12, justifyContent: 'center', pointerEvents: 'auto' }}>
            <button onClick={go} style={{
              padding: '12px 28px', borderRadius: 8,
              background: G.green, color: '#fff',
              fontSize: 13, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
              border: 'none', cursor: 'pointer',
              boxShadow: `0 4px 24px rgba(61,139,94,0.3)`,
            }}
              onMouseEnter={e => (e.currentTarget.style.background = G.greenHi)}
              onMouseLeave={e => (e.currentTarget.style.background = G.green)}>
              Initialize System →
            </button>
            <a href="#what-we-do" style={{
              padding: '12px 28px', borderRadius: 8,
              background: 'transparent', color: G.dim,
              fontSize: 13, fontFamily: 'JetBrains Mono, monospace',
              border: `1px solid ${G.borderLit}`, cursor: 'pointer', textDecoration: 'none',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = G.text; (e.currentTarget as HTMLElement).style.borderColor = G.dim; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = G.dim; (e.currentTarget as HTMLElement).style.borderColor = G.borderLit; }}>
              See what it does
            </a>
          </motion.div>
        </div>
      </section>

      {/* ── Backers bar ──────────────────────────────────────────────────── */}
      <div style={{
        padding: '20px 32px',
        borderTop: `1px solid ${G.border}`,
        borderBottom: `1px solid ${G.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexWrap: 'wrap', gap: 32,
        background: G.surface,
      }}>
        <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: G.mute }}>Backed by</span>
        {[
          { name: 'YC', full: 'Y Combinator S25', color: G.beige },
          { name: 'RenTech', full: 'Renaissance Technologies', color: G.stone },
        ].map(b => (
          <div key={b.name} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 6,
            background: G.surface2, border: `1px solid ${G.border}`,
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: b.color }}>{b.name}</span>
            <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: G.dim }}>{b.full}</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 36, marginLeft: 16 }}>
          {[['2,400+','engineers'],['99.98%','uptime'],['<15ms','AI latency']].map(([v,l]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: G.text }}>{v}</div>
              <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: G.mute }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── What We Do ──────────────────────────────────────────────────── */}
      <section id="what-we-do" style={{ padding: '100px 32px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.3em', textTransform: 'uppercase', color: G.green, display: 'block', marginBottom: 12 }}>
            What We Do
          </span>
          <h2 style={{ fontSize: 'clamp(28px,5vw,46px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.15, color: G.text, margin: 0 }}>
            Your entire DevOps loop,<br />
            <span style={{ color: G.greenHi }}>powered by local AI.</span>
          </h2>
          <p style={{ marginTop: 14, fontSize: 13, color: G.dim, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
            Replaces Sentry + Datadog + Snyk + Copilot. One platform. Nothing leaves your machine.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 1, background: G.border, borderRadius: 10, overflow: 'hidden' }}>
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.num}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07, duration: 0.3 }}
              style={{ padding: '32px 28px', background: G.bg, cursor: 'default' }}
              onMouseEnter={e => (e.currentTarget.style.background = G.surface)}
              onMouseLeave={e => (e.currentTarget.style.background = G.bg)}
            >
              <span style={{ fontSize: 36, fontWeight: 900, color: G.green, opacity: 0.12, display: 'block', marginBottom: 14 }}>{f.num}</span>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: G.text, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 12, color: G.dim, lineHeight: 1.6 }}>{f.desc}</p>
            </motion.div>
          ))}
        </div>

        <div style={{ marginTop: 36, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: G.mute }}>Works with</span>
          {['GPT-4o', 'Claude', 'Llama 3', 'Gemini', 'Groq', 'Ollama (local)'].map(m => (
            <span key={m} style={{
              fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
              padding: '3px 10px', borderRadius: 4,
              background: G.surface2, color: G.dim, border: `1px solid ${G.border}`,
            }}>{m}</span>
          ))}
        </div>
      </section>

      {/* ── Terminal / Connect ───────────────────────────────────────────── */}
      <section id="docs" style={{ padding: '80px 32px', background: G.surface }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontSize: 'clamp(24px,4vw,36px)', fontWeight: 900, letterSpacing: '-0.02em', color: G.text }}>
              Up and running in 30 seconds.
            </h2>
            <p style={{ fontSize: 12, color: G.dim, marginTop: 8 }}>Self-hosted. One command. No sign-up required.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Terminal */}
            <div style={{ borderRadius: 10, overflow: 'hidden', background: '#0f1a10', border: `1px solid ${G.border}` }}>
              <div style={{ display: 'flex', gap: 6, padding: '12px 16px', borderBottom: `1px solid #1a2e1a` }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: G.red }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: G.amber }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: G.green }} />
              </div>
              <div style={{ padding: '20px 22px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, lineHeight: 2, color: G.dim }}>
                <div><span style={{ color: G.greenHi }}>$</span> npx lynx init</div>
                <div style={{ color: G.mute }}>  Fetching neural seeds...</div>
                <div><span style={{ color: G.green }}>[✓]</span> Handshake established</div>
                <div><span style={{ color: G.green }}>[✓]</span> Orchestrator · 12ms</div>
                <div><span style={{ color: G.green }}>[✓]</span> Kernel v0.1.0-obsidian</div>
                <div style={{ marginTop: 8 }}>
                  <span style={{ color: G.greenHi }}>$</span>{' '}
                  <span style={{ color: G.teal }}>lynx start</span>
                  <span style={{ display: 'inline-block', width: 2, height: 14, marginLeft: 2, background: G.greenHi, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />
                </div>
              </div>
            </div>
            {/* Quickstart questionnaire */}
            <QuickstartPanel go={go} />
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{ padding: '32px', borderTop: `1px solid ${G.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LynxIcon size={20} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Lynx</span>
          <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: G.mute, marginLeft: 6 }}>v0.1.0</span>
        </div>
        <p style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: G.mute }}>MIT · open source · self-hosted · no telemetry</p>
        <div style={{ display: 'flex', gap: 20 }}>
          {['GitHub', 'Docs', 'Community'].map(l => (
            <a key={l} href="#" style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: G.mute, textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = G.text)}
              onMouseLeave={e => (e.currentTarget.style.color = G.mute)}>{l}</a>
          ))}
        </div>
      </footer>

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </main>
  );
}

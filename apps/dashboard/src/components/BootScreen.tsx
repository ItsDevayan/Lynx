/**
 * Lynx Boot Screen — Conductor Mesh Topology
 *
 * Sequence (total ~4.2s):
 *  0.0s → Canvas fades in. Subtle hex grid.
 *  0.2s → Conductor node materializes at center with targeting ring.
 *  0.4s → Specialist nodes appear one by one around the pentagon.
 *  0.8s → Connection lines draw. Data packets begin flowing.
 *  1.8s → "LYNX" assembles via character decode (each char cycles random → locks in).
 *  2.4s → Version + tagline appears.
 *  2.8s → Boot log ticks through 3 status lines.
 *  3.8s → Fade to app.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BootScreenProps {
  onComplete: () => void;
  isFirstRun?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const C = {
  bg:          '#07070f',
  conductor:   [61,  139, 94]  as [number, number, number],  // olive green
  coder:       [45,  140, 120] as [number, number, number],  // teal
  reasoner:    [212, 160, 23]  as [number, number, number],  // amber
  general:     [113, 113, 122] as [number, number, number],  // zinc grey
  autocomplete:[45,  140, 120] as [number, number, number],  // teal
  scout:       [82,  168, 122] as [number, number, number],  // sage green-hi
  line:        [61,  139, 94]  as [number, number, number],  // olive green
};

const RADIUS = 148;  // ring radius

// Pentagon angles (top = -90°, clockwise)
const SPECIALISTS = [
  { id: 'general',      label: 'GENERAL',      rgb: C.general,      angle: -90,  size: 5 },
  { id: 'coder',        label: 'CODER',         rgb: C.coder,        angle: -18,  size: 6 },
  { id: 'reasoner',     label: 'REASONER',      rgb: C.reasoner,     angle:  54,  size: 5 },
  { id: 'autocomplete', label: 'AUTO',          rgb: C.autocomplete, angle: 126,  size: 4 },
  { id: 'scout',        label: 'SCOUT',         rgb: C.scout,        angle: 198,  size: 4 },
];

function rgba(rgb: [number,number,number], a: number) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}

// ─── Hex grid ─────────────────────────────────────────────────────────────────

function drawHexGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const size = 36;
  const rows = Math.ceil(h / (size * 1.5)) + 2;
  const cols = Math.ceil(w / (size * Math.sqrt(3))) + 2;
  ctx.strokeStyle = rgba(C.general, 0.06);
  ctx.lineWidth = 0.6;

  for (let row = -1; row < rows; row++) {
    for (let col = -1; col < cols; col++) {
      const x = col * size * Math.sqrt(3) + (row % 2) * size * (Math.sqrt(3) / 2);
      const y = row * size * 1.5;
      hexPath(ctx, x, y, size - 2);
      ctx.stroke();
    }
  }
}

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const px = cx + r * Math.cos(a);
    const py = cy + r * Math.sin(a);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// ─── Mesh Canvas ──────────────────────────────────────────────────────────────

interface Packet { progress: number; speed: number; nodeIdx: number; }

function MeshCanvas({ phase }: { phase: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const tRef      = useRef(0);
  const packetsRef = useRef<Packet[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const spawnPacket = (nodeIdx: number) => {
      packetsRef.current.push({ progress: 0, speed: 0.008 + Math.random() * 0.006, nodeIdx });
    };

    let packetTimer = 0;

    const draw = (ts: number) => {
      const dt   = ts - tRef.current;
      tRef.current = ts;
      const elapsed = ts / 1000;

      const w  = canvas.width;
      const h  = canvas.height;
      const cx = w / 2;
      const cy = h * 0.42;

      ctx.clearRect(0, 0, w, h);

      // Hex grid
      drawHexGrid(ctx, w, h);

      // How many specialist nodes visible (phase = 0–6 based on time)
      const visibleNodes = Math.min(SPECIALISTS.length, Math.max(0, phase - 1));

      // Connection lines
      for (let i = 0; i < visibleNodes; i++) {
        const sp = SPECIALISTS[i];
        const rad = (sp.angle * Math.PI) / 180;
        const nx = cx + RADIUS * Math.cos(rad);
        const ny = cy + RADIUS * Math.sin(rad);
        const lineAlpha = Math.min(1, (visibleNodes - i) * 0.4) * 0.35;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = rgba(C.line, lineAlpha);
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Data packets
      packetTimer += dt;
      if (packetTimer > 280 && phase >= 4) {
        packetTimer = 0;
        spawnPacket(Math.floor(Math.random() * visibleNodes));
      }

      packetsRef.current = packetsRef.current.filter(p => p.progress < 1);
      for (const p of packetsRef.current) {
        p.progress = Math.min(1, p.progress + p.speed * (dt / 16));
        const sp = SPECIALISTS[p.nodeIdx];
        if (!sp) continue;
        const rad = (sp.angle * Math.PI) / 180;
        const nx = cx + RADIUS * Math.cos(rad);
        const ny = cy + RADIUS * Math.sin(rad);
        const px = cx + (nx - cx) * p.progress;
        const py = cy + (ny - cy) * p.progress;

        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = rgba(sp.rgb, 0.9);
        ctx.fill();

        // trail
        const trailLen = 0.06;
        const tp = Math.max(0, p.progress - trailLen);
        const tx = cx + (nx - cx) * tp;
        const ty = cy + (ny - cy) * tp;
        const grd = ctx.createLinearGradient(tx, ty, px, py);
        grd.addColorStop(0, rgba(sp.rgb, 0));
        grd.addColorStop(1, rgba(sp.rgb, 0.5));
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(px, py);
        ctx.strokeStyle = grd;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Conductor node
      if (phase >= 1) {
        const t = elapsed;

        // Outer rotating dashed ring
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * 0.4);
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.setLineDash([4, 8]);
        ctx.strokeStyle = rgba(C.conductor, 0.4);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Pulse ring
        const pulseR = 14 + Math.sin(t * 3) * 4;
        const pulseA = 0.15 + Math.sin(t * 3) * 0.1;
        ctx.beginPath();
        ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(C.conductor, pulseA);
        ctx.lineWidth = 1;
        ctx.stroke();

        // Glow
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 28);
        glow.addColorStop(0, rgba(C.conductor, 0.35));
        glow.addColorStop(1, rgba(C.conductor, 0));
        ctx.beginPath();
        ctx.arc(cx, cy, 28, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fillStyle = rgba(C.conductor, 0.95);
        ctx.fill();

        // Cross-hair ticks
        [0, 90, 180, 270].forEach(deg => {
          const ar = (deg * Math.PI) / 180;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ar) * 12, cy + Math.sin(ar) * 12);
          ctx.lineTo(cx + Math.cos(ar) * 18, cy + Math.sin(ar) * 18);
          ctx.strokeStyle = rgba(C.conductor, 0.5);
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      }

      // Specialist nodes
      for (let i = 0; i < visibleNodes; i++) {
        const sp = SPECIALISTS[i];
        const rad = (sp.angle * Math.PI) / 180;
        const nx = cx + RADIUS * Math.cos(rad);
        const ny = cy + RADIUS * Math.sin(rad);

        // Glow
        const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, sp.size * 5);
        glow.addColorStop(0, rgba(sp.rgb, 0.3));
        glow.addColorStop(1, rgba(sp.rgb, 0));
        ctx.beginPath();
        ctx.arc(nx, ny, sp.size * 5, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Core
        const pulse = 0.7 + Math.sin(elapsed * 1.5 + i) * 0.3;
        ctx.beginPath();
        ctx.arc(nx, ny, sp.size, 0, Math.PI * 2);
        ctx.fillStyle = rgba(sp.rgb, pulse);
        ctx.fill();

        // Label
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = rgba(sp.rgb, 0.75);
        ctx.fillText(sp.label, nx, ny + sp.size + 14);

        // Tiny latency hint
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillStyle = rgba(sp.rgb, 0.3);
        ctx.fillText(`${(12 + i * 7)}ms`, nx, ny + sp.size + 24);
      }

      animRef.current = requestAnimationFrame(draw);
    };

    tRef.current = performance.now();
    animRef.current = requestAnimationFrame((ts) => { tRef.current = ts; draw(ts); });

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [phase]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
    />
  );
}

// ─── Character decode ─────────────────────────────────────────────────────────

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$/>|\\▸◈◎';

function useCharDecode(target: string, active: boolean, speed = 35) {
  const [chars, setChars] = useState<string[]>(() => target.split('').map(() => ''));
  const lockedRef = useRef<boolean[]>(target.split('').map(() => false));

  useEffect(() => {
    if (!active) return;
    lockedRef.current = target.split('').map(() => false);
    let frame = 0;

    const id = setInterval(() => {
      frame++;
      setChars(target.split('').map((ch, i) => {
        if (lockedRef.current[i]) return ch;
        const lockAt = i * 5 + 6;
        if (frame >= lockAt) {
          lockedRef.current[i] = true;
          return ch;
        }
        if (frame >= i * 5) {
          return CHARSET[Math.floor(Math.random() * CHARSET.length)];
        }
        return ' ';
      }));

      if (lockedRef.current.every(Boolean)) clearInterval(id);
    }, speed);

    return () => clearInterval(id);
  }, [active, target]);

  return chars;
}

// ─── Boot log lines ───────────────────────────────────────────────────────────

function BootLog({ active, isFirstRun }: { active: boolean; isFirstRun?: boolean }) {
  const [lines, setLines] = useState(0);

  const LOG = isFirstRun ? [
    '▸ mesh topology     initialized',
    '▸ orchestrator      ready',
    '▸ context store     online',
  ] : [
    '▸ mesh topology     online',
    '▸ session context   loaded',
    '▸ models            available',
  ];

  useEffect(() => {
    if (!active) return;
    const timers = LOG.map((_, i) =>
      setTimeout(() => setLines(i + 1), i * 220),
    );
    return () => timers.forEach(clearTimeout);
  }, [active]);

  return (
    <div className="font-mono" style={{ minHeight: 64 }}>
      {LOG.slice(0, lines).map((line, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.18 }}
          className="flex items-center justify-between"
          style={{ color: 'rgba(113,113,122,0.5)', fontSize: 11, lineHeight: '1.9' }}
        >
          <span>{line}</span>
          <span style={{ color: 'rgba(29,184,124,0.7)', marginLeft: 24 }}>OK</span>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function BootScreen({ onComplete, isFirstRun }: BootScreenProps) {
  // phase: 0=black 1=conductor 2..6=specialists 7=text 8=log 9=done
  const [phase, setPhase] = useState(0);
  const [textActive, setTextActive] = useState(false);
  const [logActive, setLogActive] = useState(false);
  const lynxChars = useCharDecode('LYNX', textActive, 38);

  useEffect(() => {
    const schedule = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 440),
      setTimeout(() => setPhase(3), 640),
      setTimeout(() => setPhase(4), 840),
      setTimeout(() => setPhase(5), 1040),
      setTimeout(() => setPhase(6), 1240),
      setTimeout(() => setPhase(7), 1500),
      setTimeout(() => setTextActive(true), 1600),
      setTimeout(() => setLogActive(true), 2300),
      setTimeout(() => setPhase(9), 3700),
      setTimeout(onComplete, 4000),
    ];
    return () => schedule.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 overflow-hidden select-none"
      style={{ background: C.bg }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Canvas: hex grid + mesh */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 9 ? 0 : 1 }}
        transition={{ duration: phase >= 9 ? 0.6 : 0.8 }}
      >
        <MeshCanvas phase={phase} />
      </motion.div>

      {/* Radial vignette so center text is readable */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 60% 50% at 50% 42%, transparent 20%, ${C.bg} 85%)`,
        }}
      />

      {/* Text panel — bottom 45% of screen */}
      <div
        className="absolute inset-x-0 flex flex-col items-center justify-end pb-[13vh]"
        style={{ top: '45%', bottom: 0 }}
      >
        <AnimatePresence>
          {phase >= 7 && (
            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {/* LYNX wordmark */}
              <div
                className="font-mono font-bold tracking-widest mb-3"
                style={{
                  fontSize: 'clamp(56px, 10vw, 88px)',
                  letterSpacing: '0.18em',
                  color: '#f0f0ff',
                  textShadow: '0 0 60px rgba(61,139,94,0.25)',
                  minWidth: '4ch',
                }}
              >
                {lynxChars.join('')}
              </div>

              {/* Divider */}
              <div
                className="mx-auto mb-3"
                style={{ width: 200, height: 1, background: 'linear-gradient(90deg, transparent, rgba(61,139,94,0.4), transparent)' }}
              />

              {/* Tagline */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="font-mono mb-6"
                style={{ fontSize: 11, letterSpacing: '0.22em', color: 'rgba(113,113,122,0.45)' }}
              >
                AI MESH · DEVOPS · OPEN SOURCE
              </motion.div>

              {/* Boot log */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-left"
                style={{ width: 260 }}
              >
                <BootLog active={logActive} isFirstRun={isFirstRun} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Version — bottom right */}
      <motion.div
        className="absolute bottom-4 right-5 font-mono"
        style={{ fontSize: 10, color: 'rgba(61,139,94,0.25)', letterSpacing: '0.1em' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 7 ? 1 : 0 }}
        transition={{ delay: 0.8 }}
      >
        v0.1.0
      </motion.div>

      {/* Conductor label — center of canvas */}
      <AnimatePresence>
        {phase >= 1 && phase < 9 && (
          <motion.div
            className="absolute font-mono pointer-events-none"
            style={{
              top: 'calc(42% + 20px)',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: 9,
              color: 'rgba(61,139,94,0.55)',
              letterSpacing: '0.15em',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            CONDUCTOR
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

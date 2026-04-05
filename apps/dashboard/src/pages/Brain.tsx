import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
}

const SUGGESTIONS = [
  'What are the most critical errors in my codebase right now?',
  'Explain the error fingerprinting algorithm',
  'Which dependencies have known CVEs?',
  'Suggest performance improvements for the API',
  'Write a test for the ingest endpoint',
];

export function BrainPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isThinking) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: msg }]);
    setIsThinking(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      setMessages((m) => [...m, {
        role: 'assistant',
        content: data.content ?? data.error ?? 'No response.',
        thinking: data.thinking,
      }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Connection error. Is the API running on :4000?' }]);
    } finally {
      setIsThinking(false);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div
      className="flex flex-col"
      style={{ height: '100%', minHeight: 0 }}
    >
      {/* Header */}
      <div
        className="px-6 py-3 flex-shrink-0 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <h1 className="text-sm font-semibold">brain</h1>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            AI engineering partner · codebase RAG · always shows reasoning
          </p>
        </div>
        <span className="badge badge-info text-xs">chain-of-thought on</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-5" style={{ minHeight: 0 }}>
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center">
            {/* Center prompt */}
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 font-mono text-xl"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border-lit)', color: 'var(--purple-hi)' }}
            >
              ◈
            </div>
            <h2 className="font-semibold mb-1">Ask me anything</h2>
            <p className="text-xs mb-8 text-center max-w-xs" style={{ color: 'var(--text-dim)' }}>
              I have full context of your errors, tests, and security issues. I always show my thinking.
            </p>

            {/* Suggestions */}
            <div className="w-full max-w-xl space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full text-left px-4 py-2.5 rounded text-xs transition-all"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-dim)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--purple)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--text)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--text-dim)';
                  }}
                >
                  <span className="font-mono mr-2" style={{ color: 'var(--purple)' }}>→</span>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl">
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <span
                    className="mr-2 mt-2 font-mono text-xs flex-shrink-0"
                    style={{ color: 'var(--purple-hi)' }}
                  >
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
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
                {msg.role === 'user' && (
                  <span className="ml-2 mt-2 font-mono text-xs flex-shrink-0" style={{ color: 'var(--text-dim)' }}>
                    you
                  </span>
                )}
              </motion.div>
            ))}

            {isThinking && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <span className="mr-2 mt-2 font-mono text-xs" style={{ color: 'var(--purple-hi)' }}>◈</span>
                <div
                  className="rounded px-4 py-3 flex items-center gap-1.5"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
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
              </motion.div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div
        className="px-6 py-4 flex-shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        <div
          className="flex items-center gap-3 rounded px-3 py-2"
          style={{ background: 'var(--bg)', border: '1px solid var(--border-lit)' }}
          onFocus={() => {}} // handled by child
        >
          <span className="font-mono text-xs flex-shrink-0" style={{ color: 'var(--purple)' }}>›</span>
          <input
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}
            placeholder="Ask about your codebase, errors, architecture..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
            disabled={isThinking}
          />
          <span className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>↵</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Lynx Memory Page — /memory
 *
 * Browse, search, create, edit, pin, and delete shared project memory entries.
 * Data from GET/POST/DELETE /api/memory
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemoryEntry {
  id: string;
  type: 'fact' | 'decision' | 'task' | 'architecture' | 'person' | 'note' | 'error-pattern' | 'integration';
  title: string;
  content: string;
  tags: string[];
  source: string;
  projectPath?: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
}

function getConfig() {
  try { return JSON.parse(localStorage.getItem('lynx_config') ?? 'null'); } catch { return null; }
}

const TYPE_COLOR: Record<string, string> = {
  fact:           'var(--teal)',
  decision:       'var(--purple-hi)',
  task:           'var(--amber)',
  architecture:   'var(--purple)',
  person:         'var(--text-dim)',
  note:           'var(--text-dim)',
  'error-pattern':'var(--red)',
  integration:    'var(--teal)',
};

const TYPES: MemoryEntry['type'][] = ['fact', 'decision', 'task', 'architecture', 'person', 'note', 'error-pattern', 'integration'];

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EntryModal({
  initial,
  projectPath,
  onSave,
  onClose,
}: {
  initial?: Partial<MemoryEntry>;
  projectPath?: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<MemoryEntry['type']>(initial?.type ?? 'note');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [tags, setTags] = useState(initial?.tags?.join(', ') ?? '');
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    await fetch('/api/memory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: initial?.id,
        type, title, content,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        source: 'user',
        projectPath,
        pinned,
      }),
    });
    setSaving(false);
    onSave();
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="rounded p-5 w-full max-w-md"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <p className="font-semibold text-sm mb-4">{initial?.id ? 'Edit entry' : 'New memory entry'}</p>

        {/* Type */}
        <div className="mb-3">
          <label className="block text-xs font-mono mb-1.5" style={{ color: 'var(--text-dim)' }}>type</label>
          <div className="flex flex-wrap gap-1">
            {TYPES.map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className="font-mono text-xs px-2 py-0.5 rounded transition-all"
                style={{
                  background: type === t ? 'var(--overlay)' : 'var(--bg)',
                  border: `1px solid ${type === t ? TYPE_COLOR[t] : 'var(--border)'}`,
                  color: type === t ? TYPE_COLOR[t] : 'var(--text-mute)',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div className="mb-3">
          <label className="block text-xs font-mono mb-1.5" style={{ color: 'var(--text-dim)' }}>title</label>
          <input
            autoFocus
            className="w-full rounded px-3 py-2 text-xs outline-none font-mono"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Short title…"
          />
        </div>

        {/* Content */}
        <div className="mb-3">
          <label className="block text-xs font-mono mb-1.5" style={{ color: 'var(--text-dim)' }}>content</label>
          <textarea
            className="w-full rounded px-3 py-2 text-xs outline-none resize-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', minHeight: 80, fontFamily: 'inherit' }}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Detailed notes…"
          />
        </div>

        {/* Tags */}
        <div className="mb-4">
          <label className="block text-xs font-mono mb-1.5" style={{ color: 'var(--text-dim)' }}>tags (comma separated)</label>
          <input
            className="w-full rounded px-3 py-2 text-xs outline-none font-mono"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="backend, auth, performance…"
          />
        </div>

        {/* Pin */}
        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
          <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>📌 Always include in AI context</span>
        </label>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !title.trim() || !content.trim()}
            className="btn btn-primary text-xs flex-1"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="btn btn-ghost text-xs">Cancel</button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Entry card ───────────────────────────────────────────────────────────────

function EntryCard({ entry, onEdit, onDelete, onPin }: {
  entry: MemoryEntry;
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
}) {
  const color = TYPE_COLOR[entry.type] ?? 'var(--text-dim)';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="rounded p-4"
      style={{ background: 'var(--surface)', border: `1px solid ${entry.pinned ? 'rgba(124,111,205,0.3)' : 'var(--border)'}` }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--bg)', color, border: `1px solid ${color}40` }}>
            {entry.type}
          </span>
          {entry.pinned && <span style={{ fontSize: 12 }}>📌</span>}
          <span className="font-semibold text-xs truncate" style={{ color: 'var(--text)' }}>{entry.title}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onPin} className="font-mono text-xs px-1.5 py-0.5 rounded hover:opacity-80" style={{ color: entry.pinned ? 'var(--purple)' : 'var(--text-mute)' }} title={entry.pinned ? 'Unpin' : 'Pin'}>
            {entry.pinned ? '◈' : '◇'}
          </button>
          <button onClick={onEdit} className="font-mono text-xs px-1.5 py-0.5 rounded hover:opacity-80" style={{ color: 'var(--text-mute)' }}>edit</button>
          <button onClick={onDelete} className="font-mono text-xs px-1.5 py-0.5 rounded hover:opacity-80" style={{ color: 'var(--red)' }}>✕</button>
        </div>
      </div>

      <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--text-dim)' }}>
        {entry.content.slice(0, 200)}{entry.content.length > 200 ? '…' : ''}
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        {entry.tags.map(t => (
          <span key={t} className="font-mono text-xs px-1 rounded" style={{ background: 'var(--bg)', color: 'var(--text-mute)', fontSize: 10 }}>
            {t}
          </span>
        ))}
        <span className="ml-auto font-mono text-xs" style={{ color: 'var(--text-mute)', fontSize: 10 }}>
          {entry.source} · {formatDistanceToNow(new Date(entry.updatedAt), { addSuffix: true })}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MemoryPage() {
  const config = getConfig();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [editing, setEditing] = useState<Partial<MemoryEntry> | null>(null);
  const [showNew, setShowNew] = useState(false);

  const qs = new URLSearchParams();
  if (config?.projectPath) qs.set('projectPath', config.projectPath);
  if (search) qs.set('search', search);
  if (filterType) qs.set('type', filterType);
  qs.set('limit', '100');

  const { data, isLoading } = useQuery<{ entries: MemoryEntry[]; total: number }>({
    queryKey: ['memory', config?.projectPath, search, filterType],
    queryFn: () => fetch(`/api/memory?${qs}`).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['memory'] });

  const handleDelete = async (id: string) => {
    const qs2 = config?.projectPath ? `?projectPath=${encodeURIComponent(config.projectPath)}` : '';
    await fetch(`/api/memory/${id}${qs2}`, { method: 'DELETE' });
    refresh();
  };

  const handlePin = async (entry: MemoryEntry) => {
    await fetch('/api/memory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...entry, id: entry.id, pinned: !entry.pinned, projectPath: config?.projectPath }),
    });
    refresh();
  };

  const entries = data?.entries ?? [];
  const pinned = entries.filter(e => e.pinned);
  const rest = entries.filter(e => !e.pinned);

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-base font-semibold">memory</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
            shared context · {data?.total ?? 0} entries · injected into every AI request
          </p>
        </div>
        <button className="btn btn-primary text-xs" onClick={() => setShowNew(true)}>
          + New entry
        </button>
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-2 mb-5">
        <input
          className="flex-1 rounded px-3 py-1.5 text-xs font-mono outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
          placeholder="Search memory…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--purple)'}
          onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
        />
        <select
          className="rounded px-2 py-1.5 text-xs font-mono outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-dim)' }}
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="">all types</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {isLoading && (
        <p className="text-xs font-mono" style={{ color: 'var(--text-mute)' }}>loading…</p>
      )}

      {/* Pinned section */}
      {pinned.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-mono mb-2" style={{ color: 'var(--purple)', fontSize: 10 }}>PINNED — ALWAYS IN AI CONTEXT</p>
          <div className="space-y-2">
            <AnimatePresence>
              {pinned.map(e => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  onEdit={() => setEditing(e)}
                  onDelete={() => handleDelete(e.id)}
                  onPin={() => handlePin(e)}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* All entries */}
      {rest.length > 0 && (
        <div className="space-y-2">
          <AnimatePresence>
            {rest.map(e => (
              <EntryCard
                key={e.id}
                entry={e}
                onEdit={() => setEditing(e)}
                onDelete={() => handleDelete(e.id)}
                onPin={() => handlePin(e)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {!isLoading && entries.length === 0 && (
        <div className="text-center py-20">
          <p className="font-mono text-3xl mb-4" style={{ color: 'var(--text-mute)' }}>◎</p>
          <p className="font-semibold mb-1">No memory yet</p>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            Use <span className="font-mono" style={{ color: 'var(--purple)' }}>/remember</span> in Brain, or add an entry above.
          </p>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {(showNew || editing) && (
          <EntryModal
            key="modal"
            initial={editing ?? {}}
            projectPath={config?.projectPath}
            onSave={() => { refresh(); setShowNew(false); setEditing(null); }}
            onClose={() => { setShowNew(false); setEditing(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

# Lynx — Roadmap & Feature Checklist

> AI-first DevOps platform. This file tracks every planned feature.
> Checked items are **shipped and on `main`**. Unchecked items are in progress or queued.

---

## Core Platform

- [x] Boot screen + cinematic first-run animation
- [x] Onboarding wizard (project path, LLM config, provisioning)
- [x] Landing page (LynxLanding)
- [x] Sidebar with live approval badge + mesh status
- [x] Settings page (orchestrator, executor, project re-scan, RAG index)
- [x] Live config reload — Settings saves propagate to sidebar/statusbar instantly
- [x] WebSocket real-time push (error:new, hitl:created, hitl:applied)
- [x] Multi-project memory (per project-path hash)

---

## Brain (AI Engineering Partner)

- [x] Slash command menu (`/errors`, `/scan`, `/test`, `/security`, `/git`, `/search`, `/crawl`, `/design`, `/remember`, `/memory`, `/model`, `/notion`, `/slack`, `/refactor`, `/explain`)
- [x] Model picker — switch between Groq / Ollama / Claude / OpenAI per session
- [x] Intelligent model suggestion chips — recommends better model for task type
- [x] Per-request model override forwarded to mesh (no global config mutation)
- [x] Chain-of-thought (thinking block) toggle per message
- [x] Routing trace badge (task type, conductor, specialist, parallel, bottleneck)
- [x] HITL code proposal — "send for approval" on code blocks
- [x] HITL status updates via WS (approved ✓ / rejected ✗ reflected live)
- [x] RAG context injection (Qdrant semantic search before every message)
- [x] Shared project memory injection (pinned + recent entries in system prompt)
- [x] Auto-extract memory from conversation every 5 messages
- [x] Markdown rendering (bold, italic, code, headers, lists, links)
- [x] Persistent chat history (localStorage, last 60 messages)
- [x] Clear history button
- [x] Grouped suggestion chips (understand / code / security / ops)
- [x] Active model shown in input bar statusline
- [x] **Streaming responses** (SSE word-by-word render as model generates)
- [x] **Apply code to file** — parse filename, show diff, write on confirm
- [ ] **/review** — fetch git diff and return structured code review
- [ ] **Export conversation** as markdown download
- [ ] **Brain pinned context** — pin memory entries that always appear in prompt
- [ ] **Agent mode** — multi-step autonomous task loop with approval gates

---

## Monitor & Errors

- [x] Error ingestion (POST /api/ingest — LEMU + OTel compatible)
- [x] Error tracker (group by fingerprint, severity, layer)
- [x] WS push on new errors → Overview auto-refetches
- [x] Retention service (auto-purge old events)
- [ ] **Error trends sparkline** (7-day chart in Overview + Monitor — API done, frontend pending)
- [ ] **Monitor search/filter** (keyword + severity filter — API done, frontend pending)

---

## Tests

- [x] Auto-detect test framework from project scan
- [x] Run tests via SSE stream (▶ Run tests button)
- [x] Test file list from scan
- [ ] **Auto-fix button** — failing test → pre-fill Brain with fix prompt

---

## Security

- [x] CVE scanning (npm audit / pip-audit / cargo audit)
- [x] SAST scanning (Semgrep if available)
- [x] LLM summary of findings
- [x] Cached last scan in localStorage (shows scanned-X-ago)
- [ ] **Auto-fix button** — CVE finding → Brain fix prompt
- [ ] **Dependency graph** — visualise vulnerable package chains

---

## Scout (Competitor Intelligence)

- [x] GitHub trending scrape (weekly)
- [x] HackerNews Algolia search
- [x] LLM feature gap analysis
- [x] Topics input (comma-separated)
- [x] Tabs: analysis / github / hn

---

## Approvals (HITL)

- [x] Approval queue (pending / approved / rejected)
- [x] Full lifecycle: create → approve/reject → WS push
- [x] Brain sends code proposals to HITL
- [x] Brain reflects approval status in real-time

---

## Integrations

- [x] Notion — push Brain output as page
- [x] Slack — send alerts / messages
- [x] Stitch — AI component generation (`/design`)
- [x] **GitHub webhooks** — receive push/PR events, trigger re-scans
- [ ] **GitHub Actions** — view CI run status
- [ ] **Jira / Linear** — create tickets from error findings

---

## RAG / Knowledge Base

- [x] Qdrant-based codebase indexing (`/api/crawl`)
- [x] Semantic search in Brain (`/search`)
- [x] Shared project memory CRUD (`/api/memory`)
- [x] **Memory page** — dedicated `/memory` UI (browse, edit, pin, delete)
- [ ] **Stitch design gallery** — gallery of Brain-generated components

---

## UX / Polish

- [x] VS Code-style sidebar with keyboard shortcut hints
- [x] Routing trace + model suggestion chips in Brain
- [x] **Keyboard shortcuts** — `Alt+1-8` nav, `Alt+K` focus Brain input, `Alt+N` notifications
- [x] **Theme toggle** — dark / light mode with persistence
- [x] **Notification center** — bell icon + slide-out feed (errors, approvals, agent tasks)
- [x] **Diff viewer component** — git-style `---/+++` diff for code proposals
- [ ] **Multi-project switcher** — quick-switch between projects in sidebar

---

## Infrastructure

- [x] Fastify API + WebSocket server
- [x] PostgreSQL with migration runner
- [x] Retention service (background job)
- [x] `@lynx/core` two-tier LLM router (orchestrator + executor)
- [x] LLM mesh with RAM-aware bundle selection
- [x] **GitHub webhook receiver** (`POST /api/webhooks/github`)
- [ ] **Plugin/tool registry** — integrations register slash commands dynamically

---

## Progress

| Area | Done | Total | % |
|------|------|-------|---|
| Brain | 21 | 25 | 84% |
| Monitor | 3 | 5 | 60% |
| Tests | 3 | 4 | 75% |
| Security | 4 | 6 | 67% |
| Scout | 5 | 5 | 100% |
| Approvals | 4 | 4 | 100% |
| Integrations | 4 | 6 | 67% |
| RAG / Memory | 5 | 6 | 83% |
| UX / Polish | 6 | 7 | 86% |
| Infrastructure | 6 | 7 | 86% |
| **Total** | **61** | **75** | **81%** |

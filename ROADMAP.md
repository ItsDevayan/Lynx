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
- [x] **/review** — fetch git diff and return structured code review
- [x] **Export conversation** as markdown download (`/export`)
- [ ] **Brain pinned context** — pin memory entries that always appear in prompt
- [ ] **Agent mode** — multi-step autonomous task loop with approval gates

---

## Monitor & Errors

- [x] Error ingestion (POST /api/ingest — LEMU + OTel compatible)
- [x] Error tracker (group by fingerprint, severity, layer)
- [x] WS push on new errors → Overview auto-refetches
- [x] Retention service (auto-purge old events)
- [x] **Error trends sparkline** (7-day sparkline in Overview)
- [x] **Monitor search/filter** (keyword + severity filter with live filtering)

---

## Tests

- [x] Auto-detect test framework from project scan
- [x] Run tests via SSE stream (▶ Run tests button)
- [x] Test file list from scan
- [x] **Auto-fix button** — failing test → pre-fill Brain with fix prompt

---

## Security

- [x] CVE scanning (npm audit / pip-audit / cargo audit)
- [x] SAST scanning (Semgrep if available)
- [x] LLM summary of findings
- [x] Cached last scan in localStorage (shows scanned-X-ago)
- [x] **Auto-fix button** — CVE/SAST finding → Brain fix prompt
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
| Brain | 23 | 25 | 92% |
| Monitor | 5 | 5 | 100% |
| Tests | 4 | 4 | 100% |
| Security | 6 | 6 | 100% |
| Scout | 5 | 5 | 100% |
| Approvals | 4 | 4 | 100% |
| Integrations | 4 | 6 | 67% |
| RAG / Memory | 5 | 6 | 83% |
| UX / Polish | 6 | 7 | 86% |
| Infrastructure | 6 | 7 | 86% |
| **Total** | **68** | **75** | **91%** |

---

## What Lynx Does Today — Full Feature List

> Auto-updated on every commit. Last updated: 2026-04-07

### Feature: Brain (AI Engineering Partner)

- Natural language chat with your codebase, powered by a two-tier LLM mesh
- Model picker: Groq (Llama, DeepSeek), Ollama (local), Claude API, OpenAI — switch per session
- Intelligent model suggestions: detects when the active model is a poor fit and recommends a switch
- Per-request model override without affecting global config
- SSE streaming: responses appear word-by-word as the model generates
- Slash commands: `/errors`, `/scan`, `/test`, `/security`, `/git`, `/review`, `/search`, `/crawl`, `/design`, `/remember`, `/memory`, `/model`, `/notion`, `/slack`, `/refactor`, `/explain`, `/export`
- `/review` — fetches current git diff and returns a structured code review (CRITICAL / WARN / NOTE)
- `/export` — downloads full conversation as a markdown file
- Apply-to-file: paste code in Brain → shows a git-style diff → writes to disk on confirm
- Diff viewer: `+/-` line-level diff before any file write
- HITL proposals: send any code block for human approval before applying
- HITL live status: approved ✓ / rejected ✗ reflected in chat via WebSocket
- Persistent chat history: survives page reloads (last 60 messages in localStorage)
- Markdown rendering: bold, italic, inline code, code blocks with lang label, headers, lists, links
- Grouped suggestion chips: understand / code / security / ops
- Chain-of-thought toggle: show/hide model reasoning
- Routing trace badge: task type, conductor, specialist, parallel execution indicator
- RAG context injection: semantic codebase search (Qdrant) before every message
- Shared project memory injection: pinned + recent entries always in system prompt
- Auto-extract memory every 5 messages
- Pre-fill from other pages: "→ fix in Brain" from Security/Tests loads the issue directly

### Feature: Monitor & Errors

- Error ingestion: `POST /api/ingest` — LEMU + OpenTelemetry compatible
- Error deduplication by fingerprint (error name + stack trace hash)
- Severity levels: DEBUG, INFO, WARN, ERROR, FATAL
- Regression tracking: marks re-opened resolved errors
- Real-time push: new errors instantly appear via WebSocket without refresh
- 7-day error trends sparkline in Overview dashboard
- Search + severity filter on tracker list (live, client-side)
- Resolve tracker (marks as resolved, removed from active view)
- Retention service: auto-purges old events on a schedule

### Feature: Tests

- Auto-detect test framework: Jest, Vitest, Pytest, Mocha, Go test, Cargo test
- Stream test output via SSE as tests run
- "→ fix in Brain" button when tests fail: pre-fills Brain with failure output
- Shows test file list and count from project scan

### Feature: Security

- Dependency CVE scanning (npm audit / pip-audit / cargo audit)
- SAST scanning with Semgrep (if installed)
- LLM summary of all findings
- Cached last scan in localStorage with "scanned X ago" timestamp
- "→ fix in Brain" on every CVE and SAST finding
- Severity badges: CRITICAL / HIGH / MEDIUM / LOW

### Feature: Scout (Competitor Intelligence)

- GitHub trending repository scrape by topic
- HackerNews Algolia search integration
- LLM feature gap analysis against your project
- Custom topic input (comma-separated keywords)
- Tabbed view: AI analysis / GitHub / HN

### Feature: Approvals (HITL)

- Approval queue with pending / approved / rejected states
- Brain sends code proposals to queue with title, description, diff, and risk level
- Approve or reject with notes from the Approvals page
- WebSocket push on status changes — Brain reflects result live
- Sidebar badge shows pending count

### Feature: Integrations

- Notion: push Brain output or analysis as a Notion page
- Slack: send alerts and messages to a configured channel
- Stitch: AI component generation via `/design` — generates React + Tailwind from a description
- GitHub webhooks: receive push, PR, and CI events with HMAC-SHA256 verification

### Feature: Memory (Knowledge Base)

- Per-project memory store (entries keyed by project path hash)
- Entry types: note, decision, code, debug, context
- Pin entries to always inject them into the AI system prompt
- Full CRUD UI at `/memory`: browse, search, filter by type, create, edit, delete
- Auto-extract from Brain conversations every 5 messages
- RAG index via Qdrant for semantic search across codebase

### Feature: UX & Platform

- VS Code-style sidebar with active indicator and keyboard shortcut hints
- `Alt+1-8` — navigate to any section instantly
- `Alt+K` — focus Brain input from anywhere
- `Alt+N` — toggle notification center
- Notification center: slide-out feed for errors, approvals, agent tasks, WS events
- Dark / light theme toggle with persistence
- Boot screen with cinematic first-run animation
- Landing page with feature overview and quickstart
- Onboarding wizard: project path, LLM selection, API key, provisioning
- Provisioning screen: runs scan, RAG index, test detection in parallel
- Status bar: API health, project name, AI provider, keyboard hint
- Live config reload: Settings changes propagate to sidebar without page reload

### Feature: Infrastructure

- Fastify API server on port 4000
- WebSocket server for real-time push to all connected dashboards
- PostgreSQL with auto-migration runner
- `@lynx/core` two-tier LLM router: orchestrator (cloud) + executor (local Ollama)
- LLM Mesh: RAM-aware bundle selection, multi-model routing, session memory
- GitHub webhook receiver at `POST /api/webhooks/github`

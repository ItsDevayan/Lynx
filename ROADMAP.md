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

> Auto-updated on every git push. Last updated: 2026-04-07. **68 shipped features across 10 areas.**

---

### Feature: Brain (AI Engineering Partner)

Brain is the central AI interface of Lynx — a chat panel permanently connected to your codebase. It's not a generic chatbot; every message is enriched with live context from your project (code index, error logs, memory) before being routed to the best available model.

#### Conversation & Models

- **Natural language chat** with your codebase — ask anything from "explain this function" to "refactor the auth layer"
- **Two-tier LLM routing** — an orchestrator model (cloud: Groq, Claude, OpenAI) plans and reasons; an executor model (local: Ollama) generates code and boilerplate
- **Model picker** — switch between Groq Llama 3.3 70B, DeepSeek R1, Claude API, OpenAI GPT-4o, or local Ollama models in a single click during a session
- **Intelligent model suggestions** — Lynx detects when your active model is a poor fit (e.g., Gemma on a hard reasoning task) and shows a one-click suggestion chip to switch to a better option. No hard blocks — you're always in control.
- **Per-request model override** — the selected model is forwarded to the mesh for that specific request without mutating the global config, making concurrent sessions safe
- **SSE streaming** — responses stream word-by-word as the model generates them, so you see output immediately instead of waiting for the full response

#### Slash Commands

Every slash command is a structured action that calls real APIs rather than asking the AI to guess:

| Command | What it does |
| ------- | ------------ |
| `/errors` | Fetches live error counts + top open trackers from the Monitor |
| `/scan` | Runs a project file scan and returns language, framework, entry points |
| `/test` | Runs the detected test suite via SSE stream |
| `/security` | AI-assisted security review prompt |
| `/git` | Fetches git status, recent commits, optionally the full diff |
| `/review` | Fetches the current git diff and returns a structured code review with CRITICAL / WARN / NOTE findings and a final verdict |
| `/search <term>` | Semantic search via Qdrant RAG, falls back to ripgrep |
| `/crawl` | Indexes your project into Qdrant for future semantic search |
| `/design <desc>` | Design studio — generate a React + Tailwind component from a description |
| `/remember <fact>` | Saves a fact or decision to shared project memory |
| `/memory` | Shows all current memory entries for this project |
| `/model` | Lists available models or switches: `/model groq:deepseek-r1` |
| `/notion push:` | Pushes the last response (or specified content) to a Notion page |
| `/slack:` | Sends a message to a configured Slack channel |
| `/refactor` | Asks Brain to identify top refactoring opportunities |
| `/explain` | Full architecture explanation of the project |
| `/export` | Downloads the full conversation as a `.md` file |

#### Code Actions

- **Apply-to-file** — Brain parses filenames from code block comments (e.g., `// src/api/routes.ts`) and offers a "apply" button that shows a diff before writing the file to disk
- **Diff viewer** — git-style `+/-` line-level diff displayed inline before any file write, with an apply/cancel decision
- **HITL code proposals** — any assistant message with a substantial code block gets a "send for approval" button; the diff is queued in the Approvals page for human review before applying
- **HITL live status** — when a proposal is approved or rejected in Approvals, the Brain message updates live via WebSocket (shows ✓ approved / ✗ rejected badge)

#### Context & Memory

- **Persistent chat history** — the last 60 messages survive page reloads (localStorage); clear button in the header
- **Markdown rendering** — bold, italic, inline code, fenced code blocks with language label, `##`/`###` headers, bullet lists, links — all rendered inline without a markdown library
- **RAG context injection** — before every message, Lynx runs a semantic search over your Qdrant-indexed codebase and injects the top 4 matching snippets as context
- **Shared project memory injection** — pinned memory entries and recent notes are injected into the system prompt so the AI always knows your project's key decisions
- **Auto-extract memory** — every 5 messages, Lynx automatically extracts facts from the conversation and saves them to project memory
- **Pre-fill from other pages** — the "→ fix in Brain" buttons in Security and Tests navigate to Brain and pre-populate the input with the relevant issue

#### Routing & Observability

- **Chain-of-thought toggle** — show or collapse the model's internal reasoning block per message
- **Routing trace badge** — each message shows its task type (general / code / reasoning / autocomplete), the conductor and specialist model used, whether it ran in parallel, and if a bottleneck was detected
- **Grouped suggestion chips** — four groups of starter prompts: understand / code / security / ops

---

### Feature: Monitor & Errors

Monitor is Lynx's error observability layer. Point your app at `POST /api/ingest` and all errors start flowing in — deduplicated, grouped, and surfaced with AI analysis.

- **Error ingestion** — `POST /api/ingest` accepts LEMU-format events and is also compatible with OpenTelemetry exporters
- **Fingerprint deduplication** — errors with the same name and stack trace hash are grouped into a single tracker instead of flooding the list
- **Severity levels** — DEBUG, INFO, WARN, ERROR, FATAL — each with its own colour coding
- **Regression tracking** — if a resolved error reappears, it's marked as a regression with a count of how many times it has regressed
- **Real-time WebSocket push** — new errors appear instantly in the Monitor and Overview without polling
- **7-day error trends sparkline** — Overview dashboard shows a mini SVG sparkline for errors and warnings over the last 7 days, with a bar chart for daily totals
- **Search + severity filter** — type to search by error name, message, or layer; filter by severity with one-click pills
- **Resolve tracker** — mark an error as resolved (disappears from the active list; can be queried separately)
- **Retention service** — background job that auto-purges events older than the configured retention window

---

### Feature: Tests

- **Auto-detect test framework** — scans your project and identifies Jest, Vitest, Pytest, Mocha, Go test, or Cargo test based on config files and file patterns
- **Live test streaming** — `▶ Run tests` streams output line-by-line via SSE so you see results in real time inside the dashboard
- **"→ fix in Brain"** — when tests fail, a button appears that extracts the failure output and navigates to Brain with the failure pre-loaded as a fix prompt
- **Test file list** — shows all detected test files from the project scan with their paths

---

### Feature: Security

Security gives you a consolidated view of your project's vulnerability surface, combining dependency CVEs and static analysis in one place.

- **Dependency CVE scanning** — runs `npm audit`, `pip-audit`, or `cargo audit` depending on the detected language, returning all CVEs with severity, affected version, fix version, and CVE ID
- **SAST scanning** — if Semgrep is installed, runs static analysis with the `auto` ruleset and returns findings with file, line, rule ID, and message
- **LLM security summary** — after a scan, the executor model produces a plain-language summary of the most critical findings and recommended actions
- **Cached last scan** — scan results are stored in localStorage; the header shows "scanned X ago" so you always know how fresh the data is
- **"→ fix in Brain"** — every CVE and every SAST finding has a button that navigates to Brain and pre-populates a detailed fix prompt including the package, version, CVE ID, and recommended upgrade
- **Severity badges** — CRITICAL (red), HIGH, MEDIUM, LOW, UNKNOWN — with colour-coded backgrounds

---

### Feature: Scout (Competitor Intelligence)

Scout keeps you informed about what's happening in your technical space so you can spot trends, threats, and feature gaps.

- **GitHub trending scrape** — fetches trending repositories for your topic keywords (weekly cadence)
- **HackerNews search** — queries the Algolia HN API for recent posts matching your topics
- **LLM feature gap analysis** — the orchestrator model compares your project description against trending tools and produces a structured analysis of gaps, opportunities, and differentiation
- **Custom topics** — enter comma-separated keywords matching your project domain (e.g., `devops, observability, AI agent`)
- **Tabbed view** — three tabs: AI analysis (the gap report), GitHub (trending repos with stars and language), HN (recent posts with score and comment count)

---

### Feature: Approvals (Human-in-the-Loop)

Every time Brain proposes a code change that you aren't ready to auto-apply, you can queue it for explicit human review. This is the HITL (Human-in-the-Loop) system.

- **Approval queue** — all pending proposals appear as cards with title, description, full diff, risk level, and context (which Brain session, which project)
- **Brain → queue** — clicking "send for approval" on any code proposal in Brain creates a HITL entry with the diff extracted from the code block
- **Approve with notes** — reviewers can approve with optional notes; the approval is applied and broadcast over WebSocket
- **Reject** — rejected proposals are marked and the Brain message updates to show ✗ rejected
- **Live sync** — the sidebar badge shows the current pending count, updated in real time via WebSocket as proposals are created and resolved
- **Full audit trail** — every proposal stores who approved/rejected it and when

---

### Feature: Integrations

Lynx connects to external tools so insights and outputs can flow out of the dashboard into the places your team already works.

- **Notion** — `/notion push:` sends any Brain output to a new Notion page in your configured database. Set up via the Integrations page.
- **Slack** — `/slack: <message>` sends a message to a configured Slack channel via incoming webhook. Useful for alerting or sharing Brain analysis.
- **Stitch design studio** — `/design <description>` generates a React + Tailwind component. Stitch is an AI component generator; Lynx integrates it as a Brain slash command and falls back to the local LLM if Stitch is unavailable.
- **GitHub webhooks** — `POST /api/webhooks/github` receives GitHub push, pull request, and workflow run events. Signature is verified via HMAC-SHA256 (using `GITHUB_WEBHOOK_SECRET`). Events are broadcast over WebSocket to all connected dashboards in real time.

---

### Feature: Memory (Knowledge Base)

Memory is Lynx's long-term context store. Anything you or Brain decides is worth remembering about a project is saved here and automatically injected into future AI conversations.

- **Per-project store** — memory entries are keyed by a hash of the project path, so each project has its own isolated knowledge base
- **Entry types** — `note` (general facts), `decision` (architectural choices), `code` (important patterns or snippets), `debug` (known issues and solutions), `context` (background the AI should always know)
- **Pin entries** — pinned entries are injected into every AI system prompt for this project, so the model always has them in context
- **Full CRUD UI** at `/memory` — browse all entries, search by text, filter by type, create new entries, edit existing ones, pin/unpin, and delete
- **Auto-extract** — Brain automatically extracts facts from the conversation every 5 messages and saves them as `note` entries, building up context over time without manual effort
- **RAG index** — your codebase can be indexed into Qdrant via `/crawl` for semantic search; memory entries complement this with human-curated context

---

### Feature: UX & Platform

- **VS Code-style sidebar** — icon + label navigation with an active-state left bar indicator and keyboard shortcut hints
- **Keyboard shortcuts** — `Alt+1` through `Alt+8` navigate to overview / tests / security / monitor / brain / scout / approvals / integrations; `Alt+K` focuses the Brain input field from anywhere; `Alt+N` toggles the notification center
- **Notification center** — a slide-out panel (triggered by the bell icon or `Alt+N`) shows a live feed of system events: new errors, HITL proposals created/resolved, agent task updates. Unread count shown as a badge on the bell.
- **Dark / light theme** — toggle between dark and light mode; preference is persisted in localStorage and applied instantly via a CSS `data-theme` attribute
- **Boot screen** — cinematic first-run animation that plays once per browser session
- **Landing page** — marketing-style overview of Lynx's capabilities with a "Get started" CTA that leads into onboarding
- **Onboarding wizard** — step-by-step setup: project path → LLM provider selection → API key → provisioning. Validates each step before proceeding.
- **Provisioning screen** — after setup, runs project scan, RAG indexing, and test detection in parallel with a live progress log
- **Status bar** — bottom bar shows: API health pulse dot, current project name, active AI provider, keyboard shortcut reference
- **Live config reload** — saving settings dispatches a `lynx:config-changed` event; the sidebar, status bar, and AI context update immediately without a page reload
- **Notification bell** — in the sidebar bottom section; shows unread count badge and opens the notification center

---

### Feature: Infrastructure

The Lynx backend is a Fastify server with PostgreSQL, a WebSocket broadcast layer, and a two-tier LLM routing system.

- **Fastify API** — single server on port 4000 handling all HTTP routes and WebSocket connections
- **WebSocket broadcast** — `broadcast()` utility sends JSON events to all connected dashboard tabs simultaneously; used for errors, HITL updates, GitHub events, and more
- **PostgreSQL** — stores error events, trackers, HITL records, and memory entries. Auto-migration runner applies schema changes on startup.
- **`@lynx/core` LLM router** — the `orchestrate()` function routes to cloud models (Groq, Claude, OpenAI); `execute()` routes to local Ollama. Config is global but per-request overrides are supported without mutation.
- **LLM Mesh** — RAM-aware bundle selection chooses the right local model set based on available memory. Supports conductor/specialist routing, parallel execution for multi-part tasks, session memory, and bottleneck detection.
- **GitHub webhook receiver** — `POST /api/webhooks/github` handles push, pull_request, and workflow_run events with HMAC-SHA256 signature verification. Accepts all events in dev mode (no secret configured).

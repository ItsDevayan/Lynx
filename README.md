# Lynx

**AI-first, self-hosted DevOps platform.**  
Replaces Sentry + Datadog + Snyk + GitHub Copilot — free, local-first, your data stays on your machine.

---

## What it does

Lynx is a mesh of AI specialists that watches your project, catches bugs, fixes code, scans for vulnerabilities, and thinks alongside you. It runs locally. It never touches your code unless you approve it.

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         ORCHESTRATOR (Tier 1)                        │
│   Groq (free) · Claude API · Claude CLI · OpenAI · Gemini · Aider   │
│   Plans · Reasons · Classifies · Synthesizes · Decides              │
└──────┬──────────┬──────────┬──────────┬──────────┬─────────────────┘
       ↓          ↓          ↓          ↓          ↓
   GENERAL     CODER     REASONER  AUTOCOMPLETE  CREATIVE
  (fast chat) (code gen) (debug)   (completions) (writing/music)
                                                     +
                                                  MULTIMODAL
                                                  (image analysis)
              ─────────────── EXECUTOR MESH (Tier 2) ────────────────
              Ollama local models · private · free · GPU-accelerated
```

**Tier 1 (Orchestrator):** Cloud AI or CLI tool. Handles reasoning, planning, and deciding what each sub-task needs. Only task descriptions and routing decisions go to cloud — your code never leaves your machine.

**Tier 2 (Executor mesh):** Ollama local models. Specialist models actually write code, edit files, run searches. Everything happens on your hardware.

---

## Setup flow

```text
Boot screen  →  Landing  →  Onboarding wizard  →  Provisioning  →  App
```

| Phase            | What happens                                                                  |
|------------------|-------------------------------------------------------------------------------|
| **Boot**         | Cinematic boot animation, detects returning vs new user                       |
| **Landing** | Light-theme welcome with use-case profile picker and provider selector |
| **Onboarding** | Choose orchestrator (9 options), set project path, verify API key |
| **Provisioning** | 4 stages: env check → model download (real SSE pulls) → project scan → AI questionnaire |
| **App** | Full dashboard with 7 panels |

---

## Quick start

### Option 1 — Docker (recommended)

```bash
git clone https://github.com/devayan/lynx
cd lynx
cp .env.example .env
# Fill in GROQ_API_KEY (free at console.groq.com)

docker compose up -d
```

Open **http://localhost:7137** → setup wizard guides you through the rest.

Requires: Docker 24+, 8GB+ RAM (16GB recommended)

### Option 2 — Native (dev mode)

```bash
# Prerequisites: Node 20+, pnpm, PostgreSQL 16, Redis 7, Ollama
git clone https://github.com/devayan/lynx
cd lynx
cp .env.example .env

pnpm install
docker compose up -d postgres redis qdrant    # just the infra
pnpm --filter @lynx/api dev                    # API on :4747
pnpm --filter @lynx/dashboard dev              # Dashboard on :5173
```

---

## Orchestrator options

Pick one during setup. Connection is verified before you can proceed.

| Provider | Type | Model | Notes |
|----------|------|-------|-------|
| **Groq** | API | llama-3.3-70b-versatile | Free tier. Best starting point. |
| **Claude API** | API | claude-sonnet-4-6 | Best reasoning, extended thinking |
| **OpenAI** | API | gpt-4o | Solid all-rounder |
| **Google Gemini** | API | gemini-pro | Large context window |
| **Claude CLI** | CLI | claude-cli | Uses your local Claude Code auth |
| **OpenAI Codex CLI** | CLI | codex | Terminal-native |
| **Gemini CLI** | CLI | gemini-cli | Google's CLI tool |
| **Aider** | CLI | aider | Specialized for code editing |
| **None** | — | — | Heuristic routing only, no cloud |

---

## Default ports

All ports are configurable in `.env`. Defaults chosen to avoid conflicts with typical dev tools:

| Service    | Host port | Env var                  |
|------------|-----------|--------------------------|
| Dashboard  | **7137**  | `LYNX_DASHBOARD_PORT`    |
| API        | **4747**  | `LYNX_API_PORT`          |
| PostgreSQL | **5433**  | `LYNX_PG_PORT`           |
| Redis      | **6382**  | `LYNX_REDIS_PORT`        |
| Qdrant     | **6340**  | `LYNX_QDRANT_PORT`       |

Ollama runs **natively on your host** (not in Docker) for GPU access. Install with `curl -fsSL https://ollama.com/install.sh | sh`.

---

## Install local models

```bash
# Interactive — shows your RAM, recommends best bundle
./infra/scripts/install-models.sh

# Or pick directly
./infra/scripts/install-models.sh standard         # 16GB RAM
./infra/scripts/install-models.sh gpu-consumer     # RTX 4070 Ti+
./infra/scripts/install-models.sh creative-studio  # creative profile

# List installed / reclaim space
./infra/scripts/install-models.sh list
./infra/scripts/install-models.sh remove
```

Models are stored in `<repo>/models/` — deleting the repo deletes the models.

---

## Model bundles

### CPU bundles

| Bundle         | Min RAM | Models                                                    |
|----------------|---------|-----------------------------------------------------------|
| `minimal`      | 6GB     | Phi-3.5 Mini + Qwen Coder 3B + DeepSeek R1 8B            |
| `standard`     | 14GB    | Llama 3.1 8B + Qwen Coder 7B + DeepSeek R1 14B           |
| `workstation`  | 20GB    | Llama 3.1 8B + Qwen Coder 14B + DeepSeek R1 14B          |
| `power-cpu`    | 28GB    | Llama 3.1 8B + Qwen Coder 32B + QwQ 32B                  |
| `general-only` | 4GB     | Llama 3.2 3B + DeepSeek R1 7B                            |

### Creative bundles

| Bundle                  | Min RAM | Models                                                  |
|-------------------------|---------|---------------------------------------------------------|
| `creative-studio`       | 12GB    | Llama 3.1 8B + Gemma 3 12B + LLaVA 7B (vision)        |
| `creative-studio-lite`  | 6GB     | Llama 3.2 3B + Llama 3.1 8B + DeepSeek R1 7B           |

### Consumer GPU bundles (RTX 4070 Ti Super / 4080 / 4090)

| Bundle                    | Min VRAM | Models                                                  |
|---------------------------|----------|---------------------------------------------------------|
| `gpu-consumer`            | 12GB     | Llama 3.3 70B + Qwen Coder 32B + DeepSeek R1 32B       |
| `gpu-consumer-creative`   | 12GB     | Llama 3.3 70B + Phi-4 14B + LLaVA 34B (vision)        |

### Workstation GPU bundles (RTX 6000 Ada / A40 / A6000 48GB+)

| Bundle                       | Min VRAM | Models                                                |
|------------------------------|----------|-------------------------------------------------------|
| `gpu-workstation`            | 24GB     | Qwen 2.5 72B + Qwen Coder 32B + DeepSeek R1 70B      |
| `gpu-workstation-creative`   | 24GB     | Qwen 2.5 72B + Mistral Nemo 12B (128K) + LLaVA 34B  |

### Datacenter GPU bundles (H100 / H200 / A100 80GB+)

| Bundle                    | Min VRAM | Models                                                  |
|---------------------------|----------|---------------------------------------------------------|
| `gpu-datacenter`          | 80GB     | Llama 3.1 405B + Qwen Coder 32B + DeepSeek R1 70B      |
| `gpu-datacenter-extreme`  | 160GB    | 405B + Coder 32B + R1 70B + Gemma 3 12B + LLaVA 34B   |

---

## Use-case profiles

During setup (and switchable anytime in Settings):

| Profile        | What it loads                                                    |
|----------------|------------------------------------------------------------------|
| `coding-heavy` | Full coder + reasoner + autocomplete stack                       |
| `balanced`     | Good coder + general model                                       |
| `research`     | Heavy reasoner with large context window                         |
| `general-use`  | Lightweight chat/writing only, no coding models                  |
| `creative`     | Gemma 3 / Phi-4 for writing + LLaVA for image analysis          |
| `minimal`      | Smallest viable models, sub-5GB total                           |

Switch profiles: Settings → Profile → Download bundle → Reload mesh.

---

## Architecture

```
lynx/
├── apps/
│   ├── api/              Fastify backend (REST + WebSocket + HITL queue)
│   └── dashboard/        React SPA (7 panels, boot animation, onboarding wizard)
├── packages/
│   ├── core/             Shared types, HITL middleware, LLM mesh, notifiers
│   ├── monitor/          Error tracking, fingerprinting, dedup, alerts, retention
│   ├── crawler/          Project discovery, AST chunking, Qdrant indexing
│   ├── brain/            LLM router, RAG pipeline, CEO agent, chat WebSocket
│   ├── test-engine/      Test runner, failure analysis, LLM code repair
│   ├── guard/            SAST (Semgrep), CVE (Trivy), K8s watchdog, Falco
│   ├── scout/            Competitor analysis, trend monitoring
│   └── diagnostics/      Self-monitoring (opt-in only)
└── infra/
    ├── docker/           docker-compose, nginx, setup scripts
    └── scripts/          Model installer, setup wizard
```

### The LLM Mesh (`packages/core/src/llm-mesh.ts`)

Every request through Brain goes through the full mesh pipeline:

1. **Classify** — heuristic (fast, no LLM) or conductor LLM (accurate) classifies task type
2. **Route** — conductor dispatches to GENERAL / CODER / REASONER / AUTOCOMPLETE
3. **Context refine** — session history compressed to fit specialist's context window
4. **Execute** — local Ollama specialist model runs the task
5. **Store** — result added to session memory (ring buffer, 40-message window)

Task types:

| Type | Routed to | When |
|------|-----------|------|
| `general` | General model | Chat, Q&A, summaries |
| `code-easy` | Coder (+ autocomplete in parallel if RAM allows) | Simple functions, snippets |
| `code-hard` | Reasoner plans → Coder implements | Architecture, debugging, complex refactors |
| `reasoning` | Reasoner only | Logic, math, step-by-step analysis |
| `autocomplete` | Autocomplete model (keep_alive: 600s) | Short completions, sub-100ms target |
| `bottleneck` | Conductor fallback + warning | Task exceeds local model capability |

### Two-tier routing in practice

```
User: "Refactor the auth middleware to use JWT RS256 instead of HS256"

[1] Classify: code-hard (confidence: 94%)
[2] Orchestrator (Groq/Claude): "Plan: 1. Add RS256 keypair gen, 2. Update verifyToken(), 3. Rotate existing sessions"
[3] Executor (qwen2.5-coder → deepseek-r1): Implements the plan
[4] Orchestrator: Synthesizes + reviews output
→ Response shown in Brain with routing trace visible
```

### Session memory

Brain maintains per-session message history across requests. The session ID is stable for the browser session (`sessionStorage`). History is seeded into the mesh session on reconnect (last 10 messages). Sessions expire after 30 minutes of inactivity.

### Project context injection

Answers from the Provisioning questionnaire (`config.projectAnswers`) are automatically injected into the Brain system prompt. The orchestrator always knows:

- Your project path and name
- Framework, language, architecture answers you gave during provisioning
- Which orchestrator + executor are active

### HITL (Human In The Loop)

Lynx **never mutates your codebase** without approval. Every proposed change goes through HITL:

1. Lynx generates a diff
2. Diff stored in PostgreSQL `hitl_requests`
3. WebSocket push to dashboard
4. User sees diff in Monaco editor — approve / reject / modify
5. On approval: change applied, re-verified

---

## API endpoints

| Method | Path                          | Description                              |
|--------|-------------------------------|------------------------------------------|
| GET    | `/api/health`                 | Health check + uptime                    |
| POST   | `/api/ingest`                 | Telemetry ingest (OTel + LEMU-format)    |
| GET    | `/api/monitor/events`         | Error events list                        |
| GET    | `/api/monitor/counts`         | Event counts by severity                 |
| GET    | `/api/monitor/trackers`       | Error dedup trackers                     |
| GET    | `/api/hitl`                   | HITL queue                               |
| POST   | `/api/hitl/:id/approve`       | Approve HITL request                     |
| POST   | `/api/hitl/:id/reject`        | Reject HITL request                      |
| POST   | `/api/mesh/chat`              | Route prompt through conductor mesh      |
| GET    | `/api/mesh/status`            | Mesh config + loaded models              |
| POST   | `/api/mesh/classify`          | Classify task type without executing     |
| POST   | `/api/mesh/unload`            | Unload all models from RAM               |
| GET    | `/api/mesh/session/:id`       | Get session message history              |
| DELETE | `/api/mesh/session/:id`       | Clear session                            |
| POST   | `/api/chat`                   | Simple chat (Brain page fallback)        |
| GET    | `/api/setup/system-info`      | RAM, GPU VRAM, model recommendations     |
| POST   | `/api/setup/detect-project`   | Detect framework from path               |
| POST   | `/api/setup/config`           | Save setup wizard config                 |
| GET    | `/api/setup/config`           | Read current config                      |
| POST   | `/api/setup/test-orchestrator`| Verify API key or CLI tool connection    |
| POST   | `/api/setup/provision`        | SSE: env check → model pulls → scan      |
| POST   | `/api/setup/scan`             | Deep project structure scan              |
| GET    | `/api/setup/browse`           | Directory listing (path autocomplete)    |
| POST   | `/api/files/search`           | Search project files via executor LLM   |
| WS     | `/ws`                         | Real-time push (errors, HITL, tests)     |

---

## Dashboard panels

| Panel       | Route        | What's there                                                              |
|-------------|--------------|---------------------------------------------------------------------------|
| Overview    | `/`          | Health score, event distribution, **AI Engine two-tier status panel**     |
| Tests       | `/tests`     | Pass/fail timeline, last failure, diff viewer                             |
| Security    | `/security`  | CVE donut, SAST findings, K8s topology, Falco stream                      |
| Monitor     | `/monitor`   | Error timeline, trace viewer, top errors table                            |
| Brain       | `/brain`     | Mesh chat with **routing trace**, task-type badges, chain-of-thought, session memory |
| Scout       | `/scout`     | Competitor matrix, trend chart, feature gaps                              |
| Approvals   | `/approvals` | HITL queue, Monaco diff, approve/reject/modify                            |

### Brain panel — routing trace

Every Brain response shows:

- **Task type badge** — `general` / `code` / `code·hard` / `reasoning` / `autocomplete` in color
- **Model path** — e.g. `conductor → qwen2.5-coder:7b`
- **Parallel badge** — shown when coder + autocomplete ran simultaneously
- **Thinking** — expandable chain-of-thought (Claude API only)
- **Trace** — collapsible step-by-step routing log

### Overview panel — AI Engine

The Overview dashboard now shows the full two-tier system at a glance:

- **Orchestrator** tier: provider name + model (Groq / Claude / OpenAI etc.)
- **Executor mesh** tier: bundle name, available RAM, parallel mode status
- **Specialist grid**: general / coder / reasoner / autocomplete model names + RAM requirements
- Updates live from `/api/mesh/status` every 60s

---

## Notifications

Configure in setup wizard or `~/.lynx/config.json`:

```json
{
  "notify": {
    "channel": "slack",
    "url": "https://hooks.slack.com/..."
  }
}
```

Supported: Slack · Discord · Email (SMTP) · Custom webhook · None

---

## Changelog

### Session 2 (2026-04-06)

#### Brain — full mesh integration + slash commands

- Switched from `/api/chat` stub to `/api/mesh/chat` with full routing pipeline
- Each response shows task type badge, model path (e.g. `conductor → qwen2.5-coder`), parallel badge, collapsible routing trace
- Project context from provisioning answers auto-injected into system prompt every request
- Stable `sessionId` (sessionStorage) keeps conversation memory alive; history seeded on reconnect
- Thinking chain expandable (Claude API extended thinking)
- Slash command menu: type `/` to open — `/errors`, `/scan`, `/test`, `/explain`, `/search`, `/security`, `/refactor`
- `/search <term>` calls `POST /api/files/search` directly — shows file:line matches + LLM summary inline
- Fallback to `/api/chat` if mesh unavailable

#### Overview — AI Engine panel

- New two-tier diagram showing Orchestrator → Executor mesh
- Live specialist model grid (general, coder, reasoner, autocomplete) from `/api/mesh/status`
- RAM, parallel mode, use-case profile displayed
- Pulses green/purple based on active state

#### Sidebar — AI tier status

- Two-row AI indicator: orchestrator (provider, purple dot) + executor mesh (bundle name, teal pulse dot)
- RAM and `∥ parallel` badge shown when mesh is active
- Brain nav item shows `mesh` badge when executor mesh is initialized

#### Settings page (new)

- Full orchestrator config: provider picker (9 options) + API key input + live connection test
- Executor mesh panel: bundle name, RAM, parallel mode, all specialist models with RAM requirements
- Project panel: path editor, re-scan button with scan result display, provisioning answers viewer
- Danger zone: clear Brain session, re-run full setup wizard
- Raw config JSON viewer (`<details>` collapse)
- Saves to both localStorage and `POST /api/setup/config` backend

#### File operations API (new — `apps/api/src/routes/files.ts`)

- `POST /api/files/search` — ripgrep-first search with Node.js fallback; optional executor LLM summary of results
- `POST /api/files/read` — read a file with optional line range (max 1MB)
- `GET /api/files/tree` — directory tree up to depth 5, skips `node_modules`/`dist`/etc.

#### Mesh route — fixes & enhancements

- Fixed response field mapping (`taskType` → `task`, added `conductor`, `specialist`, `executionMode`, `stepsLog`, `isBottleneck`)
- Added `systemContext` field: project context injected into conductor on every call
- Added `history` seeding: frontend conversation history synced into mesh session memory on first request
- `_systemContext` module-level cache persists across requests

#### `/api/chat` — upgraded to mesh

- Now uses the same `LLMesh` singleton as `/api/mesh/chat`
- Accepts `{ message, history, sessionId }` — seeds history, routes through mesh, returns `task`/`specialist`/`stepsLog`
- Falls back to direct `orchestrate()` call if mesh fails

#### Onboarding — 9 orchestrator options

- API providers: Groq (free), Claude API, OpenAI, Google Gemini
- CLI providers: Claude CLI, Codex CLI, Gemini CLI, Aider
- Connection verification required before Continue is enabled
- `POST /api/setup/test-orchestrator` validates API keys and CLI tools

#### Provisioning phase (new)

- 4-stage screen: env check → model download → project scan → AI questionnaire
- Real SSE streaming for model pulls with per-model progress bars
- Project scan detects framework, language, file count, entry points
- 2 AI-generated project questions; answers saved to `config.projectAnswers`

---

## License

MIT — free forever, self-host, commercial use allowed.

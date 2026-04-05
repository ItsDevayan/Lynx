# Lynx

**AI-first, self-hosted DevOps platform.**  
Replaces Sentry + Datadog + Snyk + GitHub Copilot — free, local-first, your data stays on your machine.

---

## What it does

Lynx is a mesh of AI specialists that watches your project, catches bugs, fixes code, scans for vulnerabilities, and thinks alongside you. It runs locally. It never touches your code unless you approve it.

```
┌─────────────────────────────────────────────────────┐
│                   CONDUCTOR                          │
│   (Groq / Claude / OpenAI — full cloud quality)     │
│   Plans · Reasons · Decides                         │
└──────┬──────────┬──────────┬──────────┬────────────-┘
       │          │          │          │
   GENERAL     CODER     REASONER   AUTOCOMPLETE
  (fast chat)  (code)    (debug)    (completions)
                                      +
                                   CREATIVE
                                   (writing/music)
                                      +
                                   MULTIMODAL
                                   (image analysis)
```

The conductor (cloud) handles all reasoning and planning at full GPT-4 / Claude quality. The specialists (local Ollama models) handle execution. Your code never leaves your machine.

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

Every request goes through the mesh:

1. **Classify** — heuristic (fast) or conductor (accurate) task classification
2. **Route** — conductor → GENERAL / CODER / REASONER / AUTOCOMPLETE / CREATIVE
3. **Context refine** — compress session history to fit specialist's context window
4. **Execute** — local Ollama model runs the task
5. **Store** — result added to session memory (ring buffer, configurable TTL)

Task types:
- `general` → general model (fast chat, summaries)
- `code-easy` → coder model (simple functions, snippets)
- `code-hard` → reasoner plans → coder implements
- `reasoning` → reasoner only (debugging, logic, math)
- `autocomplete` → autocomplete model (sub-100ms inline)
- `bottleneck` → task exceeds local model capability — Lynx says so clearly

### HITL (Human In The Loop)

Lynx **never mutates your codebase** without approval. Every proposed change goes through HITL:

1. Lynx generates a diff
2. Diff stored in PostgreSQL `hitl_requests`
3. WebSocket push to dashboard
4. User sees diff in Monaco editor — approve / reject / modify
5. On approval: change applied, re-verified

### Two-tier LLM

```
Tier 1 — Orchestrator (cloud): Groq / Claude / OpenAI
  → Complex reasoning, planning, deciding what to do
  → Only task descriptions sent to cloud, never code

Tier 2 — Executor (local): Ollama
  → Actually writing code, editing files, running searches
  → Stays on your machine, GPU-accelerated if available
```

---

## API endpoints

| Method | Path                        | Description                              |
|--------|-----------------------------|------------------------------------------|
| GET    | `/api/health`               | Health check                             |
| POST   | `/api/ingest`               | Telemetry ingest (OTel + LEMU-format)    |
| GET    | `/api/monitor/events`       | Error events list                        |
| GET    | `/api/monitor/trackers`     | Error dedup trackers                     |
| GET    | `/api/hitl`                 | HITL queue                               |
| POST   | `/api/hitl/:id/approve`     | Approve HITL request                     |
| POST   | `/api/hitl/:id/reject`      | Reject HITL request                      |
| POST   | `/api/mesh/chat`            | Route prompt through conductor mesh      |
| GET    | `/api/mesh/status`          | Mesh config + loaded models              |
| POST   | `/api/mesh/unload`          | Unload all models from RAM               |
| GET    | `/api/setup/system-info`    | RAM, GPU VRAM, model recommendations     |
| POST   | `/api/setup/config`         | Save setup wizard config                 |
| GET    | `/api/setup/browse`         | Directory listing (for path autocomplete)|
| WS     | `/ws`                       | Real-time push (errors, HITL, tests)     |

---

## Dashboard panels

| Panel       | Route        | What's there                                           |
|-------------|--------------|--------------------------------------------------------|
| Overview    | `/`          | Health score, top concerns, quick stats                |
| Tests       | `/tests`     | Pass/fail timeline, last failure, diff viewer          |
| Security    | `/security`  | CVE donut, SAST findings, K8s topology, Falco stream   |
| Monitor     | `/monitor`   | Error timeline, trace viewer, top errors table         |
| Brain       | `/brain`     | Chat with mesh, chain-of-thought accordion, insights   |
| Scout       | `/scout`     | Competitor matrix, trend chart, feature gaps           |
| Approvals   | `/approvals` | HITL queue, Monaco diff, approve/reject/modify         |

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

## License

MIT — free forever, self-host, commercial use allowed.

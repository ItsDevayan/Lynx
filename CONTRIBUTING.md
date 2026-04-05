# Contributing to Lynx

This guide covers everything you need to build on Lynx — monorepo structure, how to add new packages, how the LLM mesh works, and the conventions used throughout.

---

## Prerequisites

- **Node.js** 20+
- **pnpm** 9+ (`npm install -g pnpm`)
- **Docker** 24+ (for infra services)
- **Ollama** (optional, for local model testing) — `curl -fsSL https://ollama.com/install.sh | sh`

---

## Getting started

```bash
git clone https://github.com/devayan/lynx
cd lynx
cp .env.example .env
# Add GROQ_API_KEY (free at console.groq.com) — optional but useful

# Start infra (postgres, redis, qdrant)
docker compose up -d postgres redis qdrant

# Install all workspace deps
pnpm install

# Build all packages (turbo handles dependency order)
pnpm turbo build

# Dev servers
pnpm --filter @lynx/api dev          # API: http://localhost:4747
pnpm --filter @lynx/dashboard dev    # Dashboard: http://localhost:5173
```

---

## Monorepo structure

```
lynx/
├── apps/
│   ├── api/           Node 20 + Fastify backend
│   └── dashboard/     React 18 + Vite frontend
├── packages/
│   ├── core/          Shared types, LLM mesh, HITL, notifiers
│   ├── monitor/       Error tracking, fingerprinting, retention
│   ├── crawler/       AST parsing, Qdrant indexing, file watcher
│   ├── brain/         RAG pipeline, CEO agent, LangGraph
│   ├── test-engine/   Test runner, LLM code repair
│   ├── guard/         Semgrep, Trivy, K8s watchdog, Falco
│   ├── scout/         Competitor scraping, trend analysis
│   └── diagnostics/   Self-monitoring (opt-in)
├── infra/
│   ├── docker/        docker-compose, nginx config
│   └── scripts/       install-models.sh, setup.sh
├── docker-compose.yml Full stack (API + Dashboard + infra)
├── .env.example       Port config + API keys template
├── turbo.json         Turborepo pipeline
└── pnpm-workspace.yaml
```

### Key tech choices

| Concern          | Choice             | Why                                              |
|------------------|--------------------|--------------------------------------------------|
| Build system     | Turborepo + tsup   | Incremental builds, monorepo-aware               |
| Package manager  | pnpm               | Strict symlink isolation, fast                   |
| Backend          | Fastify v4         | 3× Express, schema validation built-in           |
| Frontend         | React 18 + Vite    | Fast HMR, Framer Motion, TanStack Query          |
| DB               | PostgreSQL 16      | pgvector for embeddings, single DB               |
| Vector store     | Qdrant             | Rust, <1ms, scales independently                 |
| Module format    | Pure ESM           | `"type": "module"` everywhere, no CJS shims      |

---

## Build system

All packages use `tsup` with pure ESM output:

```json
// packages/core/package.json
{
  "type": "module",
  "main": "./dist/index.js",
  "exports": { ".": { "import": "./dist/index.js" } },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --sourcemap --tsconfig tsconfig.json"
  }
}
```

**Critical rule:** All packages must be pure ESM (`"type": "module"`). Never use CJS (`require()`). The pnpm workspace + `tsx` dev server + Node native ESM all depend on this being consistent.

### Turborepo pipeline

```json
// turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],   // builds deps first
      "outputs": ["dist/**"]
    }
  }
}
```

Run builds: `pnpm turbo build` — only rebuilds changed packages.

---

## Adding a new package

```bash
mkdir -p packages/mypackage/src
```

```json
// packages/mypackage/package.json
{
  "name": "@lynx/mypackage",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": { "build": "tsup src/index.ts --format esm --dts --sourcemap --tsconfig tsconfig.json" },
  "dependencies": { "@lynx/core": "workspace:*" },
  "devDependencies": { "tsup": "^8.5.1", "typescript": "^5.5.4" }
}
```

```json
// packages/mypackage/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "outDir": "./dist" },
  "include": ["src"]
}
```

Then add it to `pnpm-workspace.yaml` (it already matches `packages/*`).

To use it in the API: add `"@lynx/mypackage": "workspace:*"` to `apps/api/package.json` and run `pnpm install`.

---

## Adding a new API route

Create `apps/api/src/routes/myroute.ts`:

```typescript
import type { FastifyInstance } from 'fastify';

export async function myRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/my-endpoint', async (req, reply) => {
    return reply.send({ hello: 'world' });
  });

  app.post<{ Body: { foo: string } }>(
    '/api/my-endpoint',
    {
      schema: {
        body: { type: 'object', required: ['foo'], properties: { foo: { type: 'string' } } },
      },
    },
    async (req, reply) => {
      return reply.send({ received: req.body.foo });
    },
  );
}
```

Register in `apps/api/src/index.ts`:

```typescript
import { myRoutes } from './routes/myroute.js';
// ...
await app.register(myRoutes);
```

**Always** use `.js` extensions in imports (even for `.ts` files) — required for ESM Node.

---

## The LLM Mesh

The mesh lives in `packages/core/src/llm-mesh.ts`. To route a prompt:

```typescript
import { initMesh, recommendBundle } from '@lynx/core';

const bundle = recommendBundle(ramGb, vramGb, 'coding-heavy');
const mesh   = initMesh(
  { bundle, ollamaBaseUrl: 'http://localhost:11434', availableRamGb: ramGb },
  async (messages) => orchestrate(messages, { tier: 'heavy' }),
);

const response = await mesh.route('Fix the null pointer on line 42');
// response.task     — what the mesh classified this as
// response.content  — the model's answer
// response.model    — which Ollama model was used
// response.thinking — chain-of-thought (if reasoner was used)
```

### Adding a new specialist role

1. Add the role to `ModelRole` in `model-bundles.ts`
2. Add models for that role to the `MODELS` catalog
3. Add the role to relevant bundles in `BUNDLES`
4. Add routing logic in `llm-mesh.ts` → `classifyHeuristic()` and `routeTask()`

### Task classification flow

```
User prompt
    │
    ▼
classifyHeuristic()   — keyword matching, O(1)
    │  (if ambiguous or complex)
    ▼
conductorClassify()   — asks orchestrator LLM to classify
    │
    ▼
routeTask()           — picks specialist based on TaskType
    │
    ▼
callOllama()          — runs local model via Ollama REST API
    │
    ▼
addToSession()        — stores in ring-buffer session memory
```

---

## HITL middleware

Any action that mutates a file, database, or external service must go through HITL. Never apply a change directly.

```typescript
import { requestApproval } from '@lynx/core';

// Create an approval request
const request = await requestApproval({
  type: 'code-fix',
  title: 'Fix null pointer dereference in auth.ts',
  description: 'DeepSeek R1 identified a null check missing on line 42.',
  diff: unifiedDiff,        // unified diff string
  filePaths: ['src/auth.ts'],
  riskLevel: 'low',
  proposedBy: 'test-engine',
});

// request.id is stored in PostgreSQL
// WebSocket push notifies dashboard
// User approves/rejects in Approvals panel
// Your code awaits resolution via resolveRequest()
```

---

## Database

Migrations run automatically on API startup (`apps/api/src/db/migrate.ts`). Add new migrations there — they're idempotent (use `CREATE TABLE IF NOT EXISTS`).

Connection pool: `apps/api/src/db/pg.ts` — exports `query()` and `getClient()`.

The `EventStore` and `ErrorTrackerStore` interfaces are defined in `packages/monitor/src/storage.ts`. PostgreSQL implementations are in `apps/api/src/db/stores.ts`.

---

## Frontend conventions

### Styling

CSS custom properties for all colors — defined in `apps/dashboard/src/index.css`:

```css
--bg:          #07070f
--surface:     #0d0d17
--surface2:    #131320
--purple:      #5c52b8
--purple-hi:   #7c6fcd
--teal:        #1d9e75
--amber:       #d4a017
--red:         #d85a30
--text:        #e8e8f0
--text-dim:    #8888aa
--text-mute:   #555570
--border:      #1a1a2e
--border-lit:  #252540
```

Primary font: `JetBrains Mono` (monospace). Secondary: `Inter` (only for long prose).

**Never** hardcode hex colors directly in components — always use the CSS variables.

### Component conventions

- All state in React hooks, no external state management yet
- TanStack Query for all API fetches (auto-retry, caching, background refresh)
- Framer Motion for all animations (page transitions, list items, status changes)
- Radix UI primitives for accessible components (dialogs, dropdowns)
- `AnimatePresence` wrapping all conditional renders that should animate out

### WebSocket

The API pushes events over `ws://host/ws`. The frontend subscribes in `App.tsx`. To push a new event type from the API:

```typescript
// In any route handler:
app.websocketServer.clients.forEach((client) => {
  if (client.readyState === 1) {
    client.send(JSON.stringify({ type: 'my-event', data: { ... } }));
  }
});
```

---

## Adding a new model or bundle

**Add a model:**

```typescript
// packages/core/src/model-bundles.ts → MODELS

'my-model': {
  tag: 'namespace:model-tag-on-ollama',
  name: 'Human Name',
  ramRequired: 5.5,       // GB of RAM (CPU only)
  vramRequired: 8,        // GB of VRAM (optional, for GPU mode)
  role: 'coder',          // 'general' | 'coder' | 'autocomplete' | 'reasoner' | 'creative' | 'multimodal'
  quality: '★★★★☆',
  speed: 'medium',        // 'fast' | 'medium' | 'slow'
  context: 32768,
  notes: 'One-line description shown in the bundle picker.',
},
```

**Add a bundle:**

```typescript
// packages/core/src/model-bundles.ts → BUNDLES

{
  id: 'my-bundle',
  name: 'My Bundle',
  description: 'Short description shown in the setup wizard.',
  tier: 'cpu',           // 'cpu' | 'gpu-consumer' | 'gpu-workstation' | 'gpu-datacenter'
  minRamGb: 16,
  parallelRamGb: 16,     // RAM needed for parallel execution (999 = serial only)
  minVramGb: 8,          // optional, for GPU bundles
  models: {
    general:      MODELS['llama3.1-8b'],
    coder:        MODELS['qwen2.5-coder-7b'],
    autocomplete: MODELS['qwen2.5-coder-1.5b'],
    reasoner:     MODELS['deepseek-r1-14b'],
  },
  conductorHints: 'Hint for the conductor about how to use this bundle.',
  suitableFor: ['coding-heavy', 'balanced'],
},
```

The `recommendBundle()` helper automatically picks this bundle when system RAM and profile match.

The Onboarding wizard also has a copy of the bundle data (static, to avoid an API call). After adding to `model-bundles.ts`, update the `BUNDLES` array in `apps/dashboard/src/components/Onboarding.tsx` to match.

---

## Coding conventions

### TypeScript

- Strict mode always (`"strict": true` in all tsconfigs)
- No `any` — use `unknown` and narrow it
- Exported types always have explicit names (no anonymous inline types in exports)
- `.js` file extension in all imports (ESM requirement)
- No barrel re-exports of everything — only export what other packages need

### Error handling

- API routes catch errors and return structured responses: `{ ok: false, error: string }`
- Never crash the process on a single request error
- LLM failures always have a fallback path (executor → orchestrator → error message)

### Git

- Branch names: `feat/description`, `fix/description`, `chore/description`
- Commit messages: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)
- No force-pushes to `main`

---

## Running tests

```bash
pnpm test                          # all packages
pnpm --filter @lynx/core test      # specific package
pnpm --filter @lynx/monitor test   # monitor package
```

Tests use Vitest. Integration tests expect a running PostgreSQL (Docker infra).

---

## Docker build

To build the full Docker stack:

```bash
# Build everything
docker compose build

# Build just the API
docker compose build api

# Run in production mode
docker compose up -d
```

The Dockerfiles are multi-stage:
- `apps/api/Dockerfile` — builds the full monorepo, then copies only the dist + node_modules to a lean runtime image
- `apps/dashboard/Dockerfile` — Vite build → nginx serving static files + proxy

---

## Environment variables

See `.env.example` for the full list. Key variables:

| Variable            | Default                              | Description                    |
|---------------------|--------------------------------------|--------------------------------|
| `GROQ_API_KEY`      | —                                    | Orchestrator (free tier)       |
| `ANTHROPIC_API_KEY` | —                                    | Claude orchestrator            |
| `OPENAI_API_KEY`    | —                                    | GPT-4o orchestrator            |
| `OLLAMA_BASE_URL`   | `http://localhost:11434`             | Ollama server URL              |
| `DATABASE_URL`      | `postgresql://lynx:lynx_dev@...`     | PostgreSQL connection          |
| `REDIS_URL`         | `redis://localhost:6382`             | Redis connection               |
| `QDRANT_URL`        | `http://localhost:6340`              | Qdrant vector DB               |
| `JWT_SECRET`        | `lynx-change-in-production`          | API auth token signing         |
| `LYNX_DASHBOARD_PORT` | `7137`                             | Dashboard host port            |
| `LYNX_API_PORT`     | `4747`                               | API host port                  |

---

## Getting help

- Open an issue: https://github.com/devayan/lynx/issues
- Read the architecture plan: see `/home/devayan/.claude/plans/` (if you have access)
- The `packages/core/src/llm-mesh.ts` file has detailed comments on routing logic
- The `packages/core/src/model-bundles.ts` file has model catalog + bundle definitions

---

## Roadmap

- [ ] `packages/crawler` — project discovery, AST chunking, Qdrant indexing
- [ ] `packages/brain` — RAG pipeline, LangGraph CEO agent
- [ ] `packages/test-engine` — test runner, LLM code repair, RLVR loop
- [ ] `packages/guard` — Semgrep SAST, Trivy CVE, K8s watchdog
- [ ] `packages/scout` — competitor scraping, trend analysis
- [ ] Profile switching without wizard restart
- [ ] Claude CLI integration (for users with Claude Pro/Team)
- [ ] Mobile-responsive dashboard

# Personal Calorie Tracker

Please refer to the `docs/` folder for comprehensive documentation.

A full-stack calorie and nutrition tracker. Users set nutrition goals, log meals,
and read back reports and charts over any date range. Four features are powered by
a language model: extracting nutrition from a photo of a label or a plate,
estimating macros from a food name, importing a diary PDF, and a conversational
assistant that can read and write entries on the user's behalf.

- **Web** — React 19, Vite, Tailwind v4, TanStack Query, Recharts
- **API** — Fastify 5, Zod (validation *and* the OpenAPI document), Prisma 7
- **Database** — PostgreSQL 17
- **AI** — Claude, behind a provider port with a credential-free stub adapter

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | **≥ 20.19** | `node -v`. Built and tested on 20.20.2. |
| npm | ≥ 10 | Ships with Node. The repo uses npm workspaces — no pnpm or yarn. |
| Docker | any recent | Only to run Postgres. Skip it if you already have Postgres 14+. |

You do **not** need an Anthropic API key to run the app. See [section 6](#6-turning-the-real-ai-model-on).

---

## 2. Setup

Five commands from a fresh clone.

```bash
# 1. Install every workspace (root, packages/shared, apps/api, apps/web)
npm install

# 2. Create your local environment file
cp .env.example .env

# 3. Put a real secret in it — JWT_SECRET must be at least 32 characters
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
#    …then paste the output into JWT_SECRET in .env

# 4. Start Postgres and apply the schema
npm run db:up
npm run db:migrate

# 5. Build the shared package once, so the API and the web app can import it
npm run build
```

> **Why step 5 matters.** `packages/shared` holds the Zod schemas, constants and
> date helpers that both sides import. They resolve it from its compiled `dist/`,
> so the API will not start and the web app will not load until it has been built
> at least once. If you are editing shared code, run `npm run dev -w @tracker/shared`
> in a spare terminal to rebuild on save.

### Run it

Two terminals:

```bash
# Terminal 1 — API on http://localhost:4000
npm run dev

# Terminal 2 — web app on http://localhost:5173
npm run dev -w @tracker/web
```

Then open **http://localhost:5173** and register an account.

| URL | What it is |
|---|---|
| http://localhost:5173 | The web app |
| http://localhost:4000/health | Liveness + database connectivity (`503` when the DB is down) |
| http://localhost:4000/docs | Interactive API reference, generated from the Zod schemas |

The Vite dev server proxies `/api` and `/health` to the API, so the browser sees a
single origin and the refresh-token cookie behaves exactly as it will in production.

### Demo credentials with data seeded(do this after the migration scripts): 
> username: `demo@tracker.app`
> password: `demo-password-123`


---

## 3. Project layout

```
typeface/
├── apps/
│   ├── api/                  Fastify server
│   │   ├── prisma/           schema.prisma + migrations
│   │   ├── src/
│   │   │   ├── config/       env parsing and validation
│   │   │   ├── common/       AppError, the error handler, pagination
│   │   │   ├── db/           the single Prisma client + the soft-delete extension
│   │   │   └── modules/      auth, goals, weights, entries, reports, ai, chat, health
│   │   └── test/             integration tests against a real database
│   └── web/
│       └── src/
│           ├── components/   design-system pieces and chart primitives
│           ├── features/     auth, dashboard, entries, goals, reports, ai, import, chat
│           └── lib/          the typed API client, hooks, formatting
├── packages/shared/          Zod schemas, constants and pure helpers used by both
└── docker-compose.yml        PostgreSQL 17
```

Each API module follows the same shape: `*.routes.ts` (HTTP and validation) →
`*.service.ts` (business rules) → `*.dao.ts` (the only place Prisma is touched).

---

## 4. Everyday commands

Run from the repo root.

| Command | What it does |
|---|---|
| `npm run dev` | API in watch mode |
| `npm run dev -w @tracker/web` | Web app in watch mode |
| `npm run build` | Builds shared, then the API, then the web app |
| `npm run typecheck` | Type-checks every workspace, tests included |
| `npm test` | Runs the full suite (shared unit tests + API integration tests) |
| `npm run db:up` / `npm run db:down` | Start / stop the Postgres container |
| `npm run db:migrate` | Create and apply a migration in development |
| `npm run db:generate` | Regenerate the Prisma client after a schema edit |
| `npm run db:studio` | Prisma Studio, to browse the data |
| `npm run db:reset` | Drop and rebuild the development database |

### Tests

```bash
npm run db:up     # Postgres must be running
npm test
```

The API suite uses its own database (`tracker_test`), which it creates and migrates
automatically on first run, so it never touches your development data. Tests run
file-by-file rather than in parallel because they share that one database and
truncate it between cases.

---

## 5. Environment variables

All of them live in a single `.env` at the repo root, read by both the API and the
Prisma CLI. Copy `.env.example` and edit it — `.env` is gitignored and must never be
committed.

Only two have no default and must be set.

| Variable | Required | Default | What it is |
|---|---|---|---|
| `DATABASE_URL` | **yes** | — | Postgres connection string. |
| `JWT_SECRET` | **yes** | — | Signs access tokens. Minimum 32 characters. Deliberately has no fallback, because a default secret is exactly the kind of thing that reaches production unnoticed. |
| `NODE_ENV` | no | `development` | `production` turns on secure, cross-site cookies. |
| `PORT` | no | `4000` | API port. |
| `HOST` | no | `0.0.0.0` | API bind address. |
| `LOG_LEVEL` | no | `info` | Pino level. |
| `WEB_ORIGIN` | no | `http://localhost:5173` | The single origin allowed by CORS. |
| `ACCESS_TOKEN_TTL_MINUTES` | no | `15` | Access-token lifetime. |
| `REFRESH_TOKEN_TTL_DAYS` | no | `30` | Refresh-token lifetime. |
| `LLM_PROVIDER` | no | `stub` | `stub` or `claude`. See below. |
| `ANTHROPIC_API_KEY` | only for `claude` | — | Read by the SDK directly, not by our config. |
| `AI_MODEL_EXTRACTION` | no | `claude-haiku-4-5-20251001` | Photos, PDFs and estimates. |
| `AI_MODEL_CHAT` | no | `claude-haiku-4-5-20251001` | Chat tool-calling. Swap to `claude-sonnet-5` if it needs a stronger model. |
| `AI_IMAGE_MAX_BYTES` | no | `8388608` | 8 MB upload ceiling for photos. |
| `AI_PDF_MAX_BYTES` | no | `15728640` | 15 MB upload ceiling for PDFs. |
| `AI_CHAT_MAX_TURNS` | no | `8` | Tool-calling rounds per message, so a confused model cannot loop forever. |
| `AI_CHAT_TOKEN_BUDGET` | no | `12000` | History replayed to the model per request. |
| `AI_RATE_LIMIT_PER_MINUTE` | no | `20` | Per-user limit on the AI routes, which cost money per call. |

Anything omitted from `.env` falls back to the default above — the file does not have
to be exhaustive.

The web app reads one variable at build time, `VITE_API_URL`. Leave it unset locally
(the dev server proxies instead); deployments set it to the API's own origin.

---

## 6. Turning the real AI model on

The app ships with `LLM_PROVIDER=stub`. The stub is a third adapter behind the same
interface as the Claude one: it answers from fixed rules, needs no credentials, and
exercises the entire pipeline — extraction, estimation, PDF parsing and a streaming
chat that really calls tools. That is what makes the app runnable and demoable
without a key, and it is what proves the provider port is a real seam rather than a
wrapper shaped around one vendor.

To use the real model instead:

```bash
# in .env
LLM_PROVIDER=claude
ANTHROPIC_API_KEY="sk-ant-..."
```

Then **restart the API** — the environment is parsed once at boot. Nothing else
changes: same routes, same schemas, same UI.

Get a key from https://console.anthropic.com → API Keys. Calls are billed per token;
the two model tiers above are chosen so the frequent, schema-bounded work runs on the
cheaper one.

### Checking that it works

1. Restart the API and watch the log — `LLM_PROVIDER=claude` builds the real client lazily, on the first AI call.
2. **Photo** — open an entry form, click *Scan a photo*, upload a nutrition label. Real output varies with the image; stub output is always the same two drafts, which is how you can tell them apart.
3. **Estimate** — type a food name, leave the macros blank, click *Estimate macros*.
4. **PDF** — the Import page, with any food-diary PDF.
5. **Chat** — ask "how many calories did I eat yesterday?" and watch the tool-call chips stream in.

If the key is missing or wrong, every AI route returns `AI_PROVIDER_ERROR` with a
readable message rather than a stack trace; the rest of the app keeps working.

---

## 7. Troubleshooting

**`Invalid environment configuration: JWT_SECRET: ...`**
`.env` is missing or `JWT_SECRET` is under 32 characters. The server refuses to boot
rather than start with a weak secret.

**`Cannot find module '@tracker/shared'` — or a schema that exists in the source is `undefined` in the browser**
The shared package has not been built, or its build is stale. Run `npm run build`, or
keep `npm run dev -w @tracker/shared` running while you edit it.

**`PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`**
Prisma 7 does not read `.env` on its own. The repo loads it in `apps/api/prisma.config.ts`
from the repo root, so the file must exist there — not inside `apps/api/`.

**`column users.<something> does not exist`**
The generated Prisma client is older than the schema. Run `npm run db:generate`.

**`/health` returns `503` with `"db": "down"`**
Postgres is not reachable. `npm run db:up`, then `docker compose ps` to confirm the
container is healthy.

**Port 4000 or 5173 already in use**
Change `PORT` in `.env` for the API. For the web app, pass `--port` to Vite, and set
`API_PROXY_TARGET` if you moved the API.

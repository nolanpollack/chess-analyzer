# Architecture

## Stack
- Framework: TanStack Start (Vite + Nitro, bun preset)
- Router: TanStack Router (file-based, src/routes/)
- API: TanStack Start server functions (`createServerFn`) — no separate API layer
- ORM: Drizzle + pg (node-postgres driver)
- Queue: pg-boss (separate bun process: `bun run worker`)
- UI: shadcn/ui + Tailwind CSS
- Chess logic: chess.js (PGN/FEN), react-chessboard (display)
- Runtime: Bun

## Worker
- Worker entry point: src/worker/index.ts
- Job handlers: src/worker/jobs/{job-name}.ts (one file per job type)
- Worker cannot import from src/routes/ or src/server/
- Worker creates its own Postgres connection — never imports src/db/index.ts
  (shares the schema types from src/db/schema.ts, but not the connection)

## Queue (pg-boss)
- pg-boss v12: `PgBoss` is a named export (`import { PgBoss }`)
- v12 `work()` handler receives `Job<T>[]` (array), not a single job
- Polling option is `pollingIntervalSeconds` (not `newJobCheckInterval`)
- Concurrency option is `batchSize` (not `teamSize` which was removed in v12)
- v12 requires explicit queue creation via `boss.createQueue(name)` before
  `send()` or `work()` — it is idempotent (no-ops if already exists)
- Server-side enqueueing: a shared lazy `PgBoss` singleton in `src/lib/queue.ts`
  can call `send()` without `start()` — the constructor opens the DB connection,
  `send()` just inserts rows. The worker has its own instance that calls `start()` + `work()`.
- Use `ensureQueue()` from `src/lib/queue.ts` before any `send()` or `findJobs()`
  call on the server side
- Queue client file: `src/lib/queue.ts`

## Import boundaries
- src/worker/ ↔ src/server/ — no cross-imports
- src/worker/ ↔ src/routes/ — no cross-imports
- src/db/ and src/lib/ — shared, importable by all

## Job rules
- Every job must be idempotent: check for existing rows before inserting
- Every job: 3 retries with exponential backoff
- pg-boss and the web server share DATABASE_URL but use separate pools
- The Drizzle `db` instance is never imported by src/worker/ directly;
  the worker creates its own postgres connection

## Server functions + loaders
- Loaders call server functions directly (no HTTP round-trip)
- Client components use TanStack Query for mutations/caching
- Feature-specific server functions live in `src/features/{domain}/server/`
- Cross-cutting server functions (touching multiple domains) live in `src/server/`
- Server functions use `.inputValidator(zodSchema)` for input validation;
  the handler receives `{ data }` with the validated input
  (note: TanStack Start uses `inputValidator`, not `validator`)
- Server functions return discriminated results (e.g. `{ username }` | `{ error }`)
  rather than throwing — callers check `"error" in result`
- Server function catch blocks MUST return `{ error: string }` — never re-throw.
  Callers (query hooks / mutation hooks) check `"error" in result` and throw for
  React Query or display the message. Worker job handlers are the only exception:
  they re-throw so pg-boss can retry.

## External API rules
- Chess.com: public API, no auth required
- Lichess cloud eval: primary engine (free, no compute cost)
- Stockfish WASM: local engine for analysis, spawned as a child process
  via `stockfish-18-single.js` from the `stockfish` npm package
- Anthropic API / OpenAI-compatible API: used for LLM features (move explanations).
  Provider is swappable via env vars (see src/config/llm.ts).
  Supports local LLMs (Ollama, LM Studio) via the "openai" provider with LLM_BASE_URL.

## Analysis pipeline
- sync-games job returns new game IDs, enqueues analyze-game for each
- analyze-game job: creates its own DB connection, uses StockfishWasmEngine,
  walks PGN, evaluates each position, classifies moves, computes accuracy
- After engine analysis, the job generates `move_tags` rows (deterministic
  game_phase + pieces_involved for each move)
- analysis_status enum: `pending`, `complete`, `failed` (no `analyzing` value)
- Progress tracking: `moves_analyzed` / `total_moves` updated during analysis
- Configuration: `src/config/analysis.ts` — depth, thresholds, eval clamp
- Classification thresholds: blunder >= 200cp, mistake >= 100cp, inaccuracy >= 50cp

## Move explanations
- On-demand LLM-generated explanations for individual moves
- Server functions: `src/server/explanations.ts` (getExplanation, generateExplanation)
- Explanations are cached in `move_explanations` table — generate once, serve forever
- Deterministic tags (game_phase, pieces_involved) come from `move_tags` (set during analysis)
- LLM concept tags are stored on the explanation row itself
- Feature module: `src/features/explanations/` (components, hooks, types)

## Provider interfaces
All external integrations are hidden behind interfaces:
- GameProvider → src/providers/game-provider.ts
- AnalysisEngine → src/providers/analysis-engine.ts
- InsightProvider → src/providers/insight-provider.ts
Add new platforms/engines as new implementations, not by modifying
existing ones.

## Route structure
- `$username.tsx` is a layout route (renders `<Outlet />`)
- `$username/index.tsx` is the dashboard (game list + filters)
- `$username/games/$gameId.tsx` is the game detail (analysis view)
- Feature modules: `src/features/{feature}/` with components/, hooks/, types.ts, utils.ts

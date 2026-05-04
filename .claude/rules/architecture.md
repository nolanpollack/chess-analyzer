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

## Maia-2 inference sidecar (Phase 2A)
- Service location: `services/maia-inference/` (Python, uv-managed)
- Start: `uv run uvicorn src.main:app --port 8765` from `services/maia-inference/`
- Exposes `POST /infer {fen}`, `POST /infer-batch {fens}` → `{maiaVersion, ratingGrid, moveIndex, probabilities}`
  where `probabilities` is shape (41, L) — 41 ELO buckets 600..2600@50, L legal moves.
- Exposes `GET /health` for readiness.
- Weights auto-downloaded from Google Drive on first run into `maia2_models/` (gitignored).
- Maia-2 internally uses 11 coarse ELO buckets; the service deduplicates forward passes
  and broadcasts, then renormalizes rows to sum to 1.0.
- TS worker calls this service via fetch — never import Python code from TS.
- **Production maia inference uses `/infer-batch` directly** via
  `ensureMaiaDirectBatch` (`src/lib/maia-direct-batch.ts`). One HTTP call
  per game, results written straight to `maia_cache`. The legacy
  `analyze-position-maia` queue still exists and may be used by the eval
  harness with `directBatch: false`, but the per-game worker
  (`computeAndPersistMaiaRating`) no longer uses it. Going through the
  queue caused multi-minute polling stalls when any backlog existed
  (`batchSize: 2`, single-FEN `/infer` calls).

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
- Analyze-game jobs MUST be enqueued via `enqueueGameAnalysis(gameId)` from
  `src/lib/enqueue-analysis.ts` — it is the single source of truth for the
  retry policy (`retryLimit: 3, retryBackoff: true`) and the singleton key
  (`analyze-game:${gameId}`) that prevents concurrent duplicate enqueues.
  Never call `boss.send(ANALYZE_GAME_QUEUE, ...)` directly.

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

## Reconciliation
- `reconcile-analysis` (`src/worker/jobs/reconcile-analysis.ts`) is a pg-boss
  cron (`*/10 * * * *`) that recovers games which fell through the normal
  enqueue path. Two recovery criteria today:
  1. **Orphans** — `games` with no `analysis_jobs` row (pg-boss exhausted
     all retries before `claimOrCreateJob` could insert a row).
     Re-enqueued via `enqueueGameAnalysis`.
  2. **Maia stragglers** — `analysis_jobs` where Stockfish completed but
     `maia_predicted_*` is null (caused by the pre-fix
     `analyze-game-maia` swallow bug, or future similar). Re-enqueued via
     `enqueueMaiaOnly` so we don't redo Stockfish.
- Failed `analysis_jobs` are NOT auto-retried — `resetAndTriggerAnalysis`
  is the user-facing recovery path. Auto-retrying could mask real bugs.
- To extend reconciliation, add a finder + dispatch case to the handler;
  the existing `findReconcileTargets` orchestrator pattern is intentionally
  open to extension.

## Maia handler exception policy
- `analyze-game-maia` runs jobs concurrently via `Promise.allSettled`, but
  if any rejection occurred the handler MUST throw so pg-boss retries the
  batch. Successful siblings are idempotent (`isAlreadyPersisted` short-
  circuits) so retry cost is minimal. Silently swallowing rejections caused
  the April 2026 silent-data-loss incident (23 games marked `completed`
  with null maia data).

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
- Per-move clock data: `analyze-game` parses `[%clk H:MM:SS]` annotations from
  the PGN via `extractClockMsByPly` (`src/lib/analysis/pgn.ts`) and writes
  `moves.clock_remaining_ms`. Time spent per move is derived in
  `flattenMoves` (UI utility) using the game's `time_control` parsed by
  `parseTimeControl` (`src/lib/analysis/time-control.ts`). Both are null
  when annotations or time control are missing (e.g. correspondence games).

## Move explanations
- On-demand LLM-generated explanations for individual moves
- Feature module: `src/features/explanations/` — server (queries + mutations),
  hook (`use-move-explanation`), component (`ExplanationCard`)
- Explanations are cached in `move_explanations` table — generate once, serve forever
- Deterministic tags (game_phase, pieces_involved) come from `move_tags` (set during analysis)
- LLM concept tags are stored on the explanation row itself

## Provider interfaces
All external integrations are hidden behind interfaces:
- GameProvider → src/providers/game-provider.ts
- AnalysisEngine → src/providers/analysis-engine.ts
- InsightProvider → src/providers/insight-provider.ts
Add new platforms/engines as new implementations, not by modifying
existing ones.

## Route structure
- `$username.tsx` is a layout route (renders `<Outlet />`)
- `$username/index.tsx` is the profile dashboard (Elo estimate, factors, recent games)
- `$username/games/index.tsx` is the full games list (filters, sort, pagination, stats panel)
- `$username/games/$gameId.tsx` is the game detail (analysis view)
- Feature modules: `src/features/{feature}/` with components/, hooks/, types.ts, utils.ts

## Games table
- `src/features/games/components/GamesTable.tsx` is the shared table shell. It uses
  `@tanstack/react-table` for column metadata, sort state, and header rendering — but
  rows are rendered directly by `GameTableRow` (not via `flexRender`). The library's
  value here is a typed column-def system that lets the recent-games card (sort=null)
  and the full Games page consume the same column list.
- Column definitions live in `src/features/games/components/game-columns.ts`. Each
  `ColumnDef` carries `id`, header label, sortability flag, and `meta.align`. Sort is
  server-driven (`manualSorting: true`); the table emits `onSortChange` events.
- Sort + pagination are server-side via `listGames` (sortKey/sortDir/page/pageSize).
- `getGamesStats` is the aggregation endpoint behind the stats panel — counts +
  averages over the same filter set as `listGames`, plus a separate blunder-count
  query against the `moves` table.

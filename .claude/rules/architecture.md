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
- Server functions live in src/server/ organized by domain

## External API rules
- Chess.com: public API, no auth required
- Lichess cloud eval: primary engine (free, no compute cost)
- Stockfish binary: fallback only when Lichess cache misses
- Anthropic API: called ONLY from worker job handlers, never from
  server functions or route loaders

## Provider interfaces
All external integrations are hidden behind interfaces:
- GameProvider → src/providers/game-provider.ts
- AnalysisEngine → src/providers/analysis-engine.ts
- InsightProvider → src/providers/insight-provider.ts
Add new platforms/engines as new implementations, not by modifying
existing ones.

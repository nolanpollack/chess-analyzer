# Dimensional Ratings — Implementation Plan

Plan for migrating the chess-analyzer platform from precomputed per-phase /
per-piece stats to a generic dimensional rating system, as described in the
*Dimensional Rating Platform — Architecture & Design Document*.

This plan is **MVP-oriented**. The goal of MVP is the **infrastructure** to
support arbitrary dimensions, not coverage of every dimension in the design
doc. MVP ships with three dimensions (phase, piece, agency) plus the existing
concept tagger ported to the new shape.

---

## 1. Guiding decisions

These resolve the open questions in the design doc for our local context:

| Decision | Choice | Rationale |
|---|---|---|
| MVP dimensions | phase, piece, agency, concept | Phase + piece already exist deterministically; agency is cheap (uses existing engine output: forcing if move is check/capture, reactive if responding to threat); concept ports the existing tagger. |
| Migration strategy | Drop and reshape tables in place | No prod data to preserve; clean schema beats parallel-table churn. |
| Precomputed cache | Generic `dimension_score_cache` table, lazy-filled, player-scoped invalidation | Adding a new dimension is zero schema changes. Cost paid once per (player, dim, window). |
| Engine output | Add normalized `moves` table | Enables backfilling new generators without re-running Stockfish (the most expensive part of the pipeline). The JSONB blob in `gameAnalyses.moves` becomes redundant and is removed. |
| Weighting | `weight = 1.0` everywhere in MVP; columns and `weight_factors jsonb` exist from day one | Schema is forward-compatible; weighting logic added later without migration. |
| Sample-size shrinkage | Pure function applied at scoring-engine output, behind a config knob | Decoupled — swappable with no impact on tag store, generators, or cache. |
| UI | Feed existing `FactorBreakdownCard` with dimensional ratings | Keeps surface stable; replaces the current placeholder list. |

---

## 2. Target architecture

```
PGN
 │
 ▼
[ingestion]                                 src/worker/jobs/sync-games.ts
 │
 ▼
[analysis worker]                           src/worker/jobs/analyze-game.ts
 │  1. parse PGN
 │  2. engine eval per position
 │  3. write moves rows                     ── moves table
 │  4. for each move:
 │       for each registered generator:
 │           generate(MoveContext) → tags
 │       write move_tags rows               ── move_tags table (atomic)
 │  5. invalidate dimension_score_cache for player
 │
 ▼
[scoring engine]                            src/features/ratings/server/
 │  on read:
 │    1. cache lookup by (player, dim, value, window)
 │    2. on miss: SQL aggregate over move_tags
 │    3. apply shrinkage layer (pure fn)
 │    4. map to Elo via existing accuracyToElo
 │    5. write cache row
 │
 ▼
[UI]                                        FactorBreakdownCard
```

### Key tables (post-migration)

```
players              (unchanged)
games                (unchanged; analysis_status moves out)
analysis_jobs        new — pipeline state, attempts, pipeline_version, error
moves                new — one row per move; engine output as columns
move_tags            reshaped — atomic (move_id, dim_type, dim_value, source, source_version, confidence, weight, weight_factors, metadata)
dimension_score_cache new — (player_id, dim_type, dim_value, window_key, raw_score, adjusted_score, sample_size, computed_at)
tag_generators       new (registry, optional for MVP but cheap to add)
move_explanations    (unchanged; still keyed on game_analysis_id, ply — see §4)
llm_logs             (unchanged)
```

### Tables removed

- `game_analyses` — replaced by `analysis_jobs` + `moves`. `engine`, `depth`, `analyzedAt`, `accuracy_white/black` move to `analysis_jobs` or are recomputed on read.
- `game_performance` — replaced by on-read scoring + `dimension_score_cache`.
- `player_profile` — same. Trends, weaknesses, study recommendations become read-time computations or stay TODO until post-MVP.

---

## 3. Generator interface

```ts
// src/lib/tagging/types.ts
export interface TagGenerator {
  name: string;
  version: string;
  sourceType: "engine_rule" | "heuristic" | "ml_classifier" | "manual";
  dimensionTypes: readonly DimensionType[];
  generate(ctx: MoveContext): ProposedTag[];
}

export interface MoveContext {
  move: Move;                  // from moves table
  game: Game;
  previousMoves: Move[];
  engineOutput: EngineOutput;  // eval, best_move_uci, depth, multipv (future)
}

export interface ProposedTag {
  dimensionType: DimensionType;
  dimensionValue: string;      // validated against taxonomy enum at write time
  confidence: number;          // 0–1, defaults to 1 for deterministic
  metadata?: Record<string, unknown>;
}
```

A registry (`src/lib/tagging/registry.ts`) lists enabled generators. The
worker iterates the registry per move; nothing else knows about specific
generators by name.

### Taxonomy

`src/config/dimensions.ts` — single source of truth for dimension types and
their allowed values. Validated at tag-write time. The DB stores strings;
correctness is enforced in code.

```ts
export const DIMENSIONS = {
  phase:   ["opening", "middlegame", "endgame"],
  piece:   ["pawn", "knight", "bishop", "rook", "queen", "king"],
  agency:  ["forcing", "reactive", "proactive", "speculative"],
  concept: [...CONCEPT_TAXONOMY],
} as const;
```

Adding a dimension: add an entry here + register a generator. Nothing else.

---

## 4. Open coupling decisions to resolve in Phase 1

- **`move_explanations` FK target.** Currently keyed on `(game_analysis_id, ply)`. After dropping `game_analyses`, repoint to `(game_id, ply)` or `move_id`. `move_id` is cleaner; `(game_id, ply)` is friendlier for the LLM call site that doesn't have a move row in hand. **Recommendation:** `move_id` with a unique constraint.
- **`opening_eco` / `opening_name`.** Currently denormalized onto `move_tags`. In the new shape, opening lives on `games` only; phase generator emits an `opening` dimension tag (`dim_type: "opening", dim_value: <eco>`) for opening-phase moves if we want it queryable. **Recommendation:** keep on `games` only for MVP; add an opening dimension when needed.

---

## 5. Implementation phases

Each phase ends in a working app. No phase straddles a half-broken state.

### Phase 0 — Setup (this doc)

- This file lands in `docs/`.
- Add `.claude/rules/ratings.md` skeleton for rules that emerge during implementation.

### Phase 1 — Schema refactor

Goal: new tables in place, old tables dropped, app compiles but rating UI shows
empty/placeholder data.

1. Write the new schema in `src/db/schema.ts`:
   - `analysisJobs`, `moves`, reshape `moveTags`, `dimensionScoreCache`, `tagGenerators` (optional).
   - Remove `gameAnalyses`, `gamePerformance`, `playerProfile`.
   - Repoint `moveExplanations.gameAnalysisId` → `moveId` (or `(gameId, ply)`).
2. `bun run db:generate` — single migration that drops old tables and creates new ones (acceptable: local data wipe).
3. Stub all server functions in `features/profile/server/` and `features/game/server/` that referenced removed tables — return empty data with a TODO comment. Goal is to let the type checker pass.
4. Update `analyze-game.ts` so the worker still runs end-to-end but writes only the new tables (raw moves + classification, no tags yet).

**Done when:** `bun run check` passes, sync + analyze produces `moves` rows, the app loads with a profile page that shows empty state.

### Phase 2 — Generator interface + port existing taggers

Goal: tags being written through the generator pipeline; one dimension is queryable end-to-end.

1. `src/lib/tagging/types.ts` — interface defs.
2. `src/lib/tagging/registry.ts` — generator registration, `runGeneratorsForMove(ctx)`.
3. `src/lib/tagging/validate.ts` — taxonomy validation at write time.
4. Port existing logic to generators (one file each in `src/lib/tagging/generators/`):
   - `phase-generator.ts` — wraps `getGamePhase`.
   - `piece-generator.ts` — wraps `getPiecesInvolved`, emits one tag per piece involved.
   - `concept-generator.ts` — wraps `detectConcepts`, emits one tag per concept.
5. Wire generator pipeline into `analyze-game.ts`. Replace `buildTagRows` with a generator-driven loop.
6. Idempotency: re-running analysis deletes existing tags for the affected moves before reinserting.

**Done when:** sync + analyze produces atomic `move_tags` rows for phase, piece, concept dimensions. Manual SQL inspection confirms one row per (move, dimension_value).

### Phase 3 — Scoring engine + cache

Goal: profile page renders dimensional ratings end-to-end.

1. `src/features/ratings/server/queries.ts`:
   - `getDimensionScore(playerId, dimType, dimValue, window)` — cache lookup, on miss runs the SQL aggregate from §6.1 of the design doc, writes cache, returns.
   - `getDimensionScoresForPlayer(playerId, dimType, window)` — bulk variant for "all phases" / "all pieces."
2. `src/lib/scoring/shrinkage.ts` — pure function `applyShrinkage(raw, sampleSize, prior, k)`. MVP uses simple Bayesian shrinkage with `k = 50` (tunable) and `prior = playerOverallAccuracy`. Single call site: scoring engine output. **No other module imports this.**
3. `src/lib/scoring/rating-mapping.ts` — wraps `accuracyToElo` so the path is uniform; future per-dimension scaling lives here.
4. Cache invalidation hook in `analyze-game.ts`: after a successful analysis, delete cache rows for that player.
5. Window definition for MVP: trailing-20-games. `window_key` = `"trailing_20"` (string, opaque to cache).

**Done when:** profile page shows phase ratings, piece ratings, concept ratings, all driven by `getDimensionScore`.

### Phase 4 — New MVP dimension: agency

Goal: prove the extension path with a dimension that didn't exist before.

1. Add `"agency"` to `DIMENSIONS` in `src/config/dimensions.ts`.
2. `src/lib/tagging/generators/agency-generator.ts`:
   - `forcing` — move is check, capture, or threatens mate-in-1.
   - `reactive` — previous move attacked the moved piece or threatened mate.
   - `proactive` — neither of the above; quiet positional move.
   - `speculative` — leave for post-MVP (requires sacrifice detection).
3. Re-analyze a game and confirm agency rating appears in UI with no other code changes.

**Done when:** agency rating renders alongside phase/piece/concept with zero changes to scoring engine or UI.

### Phase 5 — UI hookup

Goal: `FactorBreakdownCard` renders dimensional ratings.

1. `src/features/ratings/hooks/use-dimension-ratings.ts` — `useQuery` per dimension type.
2. Update `FactorBreakdownCard` to render rows from a `DimensionRating[]` prop.
3. Profile page composes ratings from all four MVP dimensions into a single list passed to the card.
4. Sorting/grouping deferred — flat list for MVP.

**Done when:** dashboard looks similar to today, factor breakdown card shows real per-dimension ratings.

### Phase 6 — Backfill workflow

Goal: adding/updating a generator doesn't require re-running the engine.

1. `src/worker/jobs/backfill-generator.ts` — accepts `{ generatorName, version, gameIds? }`. Loads `moves` rows (engine output already there), runs the specified generator, inserts new `move_tags` rows with the new `source_version`. Doesn't delete old tags.
2. Scoring engine reads only "active" `source_version` per `(generator, dimension)` — config in `src/config/dimensions.ts` or the `tag_generators` registry.
3. Cleanup job (manual trigger): delete superseded `source_version` tags after validation.

**Done when:** changing the phase generator's logic + bumping version + backfill produces new tags without touching Stockfish.

---

## 6. Future dimensions (post-MVP)

Listed here so they're not forgotten. Each is purely additive: new generator, optional taxonomy entry, no scoring/UI changes.

| Dimension | Notes |
|---|---|
| `tactic` | fork/pin/skewer/discovered_attack/sacrifice/deflection/decoy/interference. Probably needs a heuristic pass first, ML classifier later. |
| `piece_role` | aggressor/defender/decoy/blockader/outpost/overloaded/pinned/x_ray. Heuristic over board state. |
| `pawn_structure` | isolated_qp/hanging_pawns/passed_pawn/doubled_pawns/pawn_break/pawn_storm. Pure board-state analysis. |
| `king_safety` | attacking_king/defending_king/king_walk/open_file_against_king/sacrificial_attack. Composite heuristics. |
| `move_nature` | tactical/positional/strategic/prophylactic/zwischenzug. Probably ML once heuristics plateau. |
| `calculation_depth` | shallow/medium/deep. Needs `depth_to_stability` from engine instrumentation (Phase 7?). |
| `exchange` | trade_initiated/trade_avoided/sound_sacrifice/etc. Heuristic over material delta. |
| `time_pressure` | comfortable/moderate/pressure. Requires PGN `%clk` parsing. |
| `missed_opportunity` | missed_win/missed_tactic/etc. Compare best move classification to player move on critical positions. |

---

## 7. Future infrastructure (post-MVP, in rough priority)

1. **Per-move weighting** — populate `weight` from `confidence × depth × criticality × uniqueness`. Requires `depth_to_stability` and `multipv >= 2` from the engine. Schema is already ready.
2. **Source disagreement view** — `tag_disagreements` SQL view; surfaces moves where two `source` values disagree on a dimension. Feeds review queue.
3. **Shadow deployment** — generators marked `enabled = true, scoring_active = false` in `tag_generators`; tags written but excluded from scoring. Promote by flipping a flag.
4. **Cohort comparison** — dimensional ratings vs. same rating-band median. Requires aggregating across players; new query layer over `move_tags` + `players`.
5. **Temporal trends** — dimensional rating delta across windows. Cache key gains a window dimension; UI shows sparklines.
6. **Personalization layer** — strengths/weaknesses/recommendations as pure read-time queries over the tag store. No new storage.

---

## 8. Risks and unknowns

- **Move-tag row volume.** ~40 moves × 3–5 tags per dimension × 4 MVP dimensions = ~600 rows per game. At 100K games that's 60M rows — the doc's stated target. Single Postgres handles this; partitioning is a Phase 7+ concern.
- **Cache invalidation on every game completion is broad.** A player with 10K analyzed games and 1K cache rows gets all 1K invalidated when game 10,001 lands. Acceptable for MVP because cache fills lazily on next read. Revisit if profile page latency suffers.
- **Generator registration is global.** No per-player or per-game opt-in. Fine for MVP, may matter for experimentation later.
- **Shrinkage `prior = overall accuracy`** is recursive (overall is itself a dimensional score). Compute overall once per request without shrinkage and use as the prior for everything else.

---

## 9. What gets recorded as a new rule

After Phase 2 lands: a new `.claude/rules/ratings.md` documenting:
- Where generators live, the interface, registration, taxonomy validation.
- The scoring engine layer order: SQL → shrinkage → rating mapping.
- Cache invalidation rule (player-scoped on game completion).
- That `src/lib/scoring/shrinkage.ts` is the single shrinkage call site — no other module imports it.

# Dimensional Ratings

## Layer order (do not skip or reorder)
The scoring engine in `src/features/ratings/server/queries.ts` runs strictly:
1. SQL aggregate over `move_tags ⨝ moves` → raw accuracy + sample size
2. Bayesian shrinkage toward player overall accuracy (`src/lib/scoring/shrinkage.ts`)
3. Accuracy → rating mapping (`src/lib/scoring/rating-mapping.ts`)

## Shrinkage isolation
`src/lib/scoring/shrinkage.ts` is the **only** place shrinkage logic lives.
Importing it from anywhere other than the scoring engine is a layering
violation — generators, the tag store, and the cache must remain ignorant
of shrinkage. Reason: keeps shrinkage swappable (k tuning, alternate priors,
empirical-Bayes) without touching upstream layers.

## Generators
Tag generators live in `src/lib/tagging/generators/` and are registered in
`src/lib/tagging/registry.ts`. Adding a generator: add to `DIMENSIONS` in
`src/config/dimensions.ts`, implement the `TagGenerator` interface, push
into `GENERATORS`. Worker calls `runGeneratorsForMove(ctx)` per move.

## Taxonomy validation
`src/config/dimensions.ts` is the single source of truth for dimension
types and allowed values. `validateTagValue` in `src/lib/tagging/validate.ts`
throws on unknown values at write time. The DB stores text — correctness is
enforced in code, not by pgEnum, so dimensions can be added without migrations.

## Cache
`dimension_score_cache` is lazy-filled at **bucket granularity**:
`(player_id, dimension_type, window_key)`. If any row exists for that
bucket, all values for that dim_type are considered cached.

Invalidation is **player-scoped** and runs at the end of every successful
analyze-game (`invalidatePlayerCache(db, playerId)` in
`src/lib/scoring/cache.ts`). Cache lives in `src/lib/scoring/cache.ts` —
not in the server-fn file — because the worker (which has its own Drizzle
instance) cannot import server functions.

## Windows
MVP supports a single window: `"trailing_20"` (most recent 20 games by
`played_at`). Window keys are opaque strings; add new ones to the
`windowKeySchema` enum in `queries.ts`.

## Per-move complexity (Phase 1)
- Complexity = win%(PV1) − win%(PV2), from the side-to-move's perspective, clamped to [0, 50].
- Both PV evals are from the side-to-move's perspective (Stockfish UCI convention).
- Implementation: `moveComplexity(pv1EvalCp, pv2EvalCp)` in `src/lib/scoring/complexity.ts`.
- Requires multipv≥2 from the engine. Production engine is configured with `MULTIPV=2`.
- Stored on the `moves` table as `complexity` (double precision, nullable on old analyses).

## Complexity-weighted accuracy (Phase 1)
- `src/lib/scoring/weighted-accuracy.ts` is the **single source of truth** for both
  game-level and dimension-slice accuracy aggregation.
- Formula: weighted harmonic mean with w_i = max(complexity_i, EPSILON=1.0).
- Two exports: `computeWeightedAccuracy(moves)` (per-color, game-level, drop-in for
  `computeGameAccuracy`) and `computeWeightedAccuracySlice(moves)` (any slice, for
  dimension ratings).
- `analysis_jobs` stores both `accuracy_white/black` (Lichess baseline) and
  `weighted_accuracy_white/black` (Phase 1) for A/B comparison. Do not remove
  the baseline columns until Phase 1 is fully validated.

## Offline evaluation scripts
- `scripts/build-eval-cache.ts` — builds `bench/cache/<name>.jsonl` by running
  Stockfish multipv=2 once per unique position. Resumable; pass `--stratify` for
  balanced rating-band × time-control sampling.
- `scripts/eval-phase1.ts` — reads the JSONL cache, fits per-TC regressions, and
  prints baseline vs Phase 1 MAE/R² comparison table + dumps `bench/phase1-results.json`.

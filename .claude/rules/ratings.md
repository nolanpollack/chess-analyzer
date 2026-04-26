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

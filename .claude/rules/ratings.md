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

## Phase 1 findings
- Complexity-**weighting** (weighted harmonic mean) failed: corr with ELO was 0.22 vs 0.35 for Lichess baseline.
- The `weighted_accuracy_white/black` columns remain in `analysis_jobs` for A/B diagnostic purposes but are NOT used for ELO prediction.
- Complexity-**partitioning** (accuracy on hard vs easy moves, separately) is the correct framing — it feeds Phase 2.

## Phase 2: multivariate OLS regression
- Feature extraction: `src/lib/scoring/game-features.ts` — `extractGameFeatures(game, color)` → `GameFeatures | null`.
- Regression: `src/lib/scoring/multivariate-regression.ts` — `fitOLS` (normal equations + ridge λ=1e-6), `predict`.
- `HIGH_COMPLEXITY_THRESHOLD = 5.0` (global constant, matches dataset mean ≈5.3; never per-game median).
- Features and rationale:
  - `lichessAccuracy` — strongest single signal (keep as a feature, not replaced)
  - `accuracyOnHighComplexity` / `accuracyOnLowComplexity` — complexity as partition; accuracy on hard moves is more diagnostic
  - `highComplexityCount` / `lowComplexityCount` — sample size for each partition
  - `blunderRate` / `inaccuracyRate` — move-quality distribution tails
  - `meanCpl` — mean centipawn loss (alternative measure to accuracy)
  - `meanTimeFractionUsed` / `blunderRateUnderPressure` — time-pressure signals (null-safe; flag column `hasTimeData`)
  - `moveCount` / `opponentRating` / `timeControlClass` (one-hot) — game-shape context
- Phase 2 is **offline-only** (eval script); not yet wired into the production worker. Wire in after further validation on a larger cache.

## Phase 3: LightGBM regression
- Training is a Python step: `uv run --with lightgbm --with numpy scripts/train-phase3.py --cache bench/cache/<file>.jsonl --out bench/phase3-model.json`
- The script reproduces the exact same seeded-LCG train/test split as the TS eval scripts (seed=42, 0.7 fraction).
- Features are identical to Phase 2 (from `game-features.ts`), reproduced in Python; `opponentRating` is excluded (label leak).
- Hyperparameters: `n_estimators` picked via 5-fold CV with early stopping (max 500 rounds, patience 30); defaults `max_depth=6, learning_rate=0.05, min_data_in_leaf=10, num_leaves=31, lambda_l2=0.1`.
- Model artifact: `bench/phase3-model.json` (gitignored, portable LightGBM JSON dump from `booster.dump_model()`).
- Inference: pure-TS tree walker in `src/lib/scoring/lgbm-inference.ts` — `loadLgbmModel(json)` + `predictLgbm(model, features)`.
  This is the production inference path once the model is wired in; it needs no Python at runtime.
- Phase 3 is **offline-eval-only** — not yet wired into the worker job.

## Offline evaluation scripts
- `scripts/build-eval-cache.ts` — builds `bench/cache/<name>.jsonl` by running
  Stockfish multipv=2 once per unique position. Resumable; pass `--stratify` for
  balanced rating-band × time-control sampling.
- `scripts/eval-phase1.ts` — reads the JSONL cache, fits per-TC regressions, and
  prints baseline vs Phase 1 MAE/R² comparison table + dumps `bench/phase1-results.json`.
- `scripts/eval-phase2.ts` — multivariate OLS comparison (baseline vs MV-no-complexity vs full MV); dumps `bench/phase2-results.json`.
- `scripts/eval-phase3.ts` — 4-column comparison (baseline, OLS, LightGBM); loads pre-trained `bench/phase3-model.json`; dumps `bench/phase3-results.json`.

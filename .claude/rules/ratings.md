# Dimensional Ratings

## Maia-2 rating pipeline (current production design)
- Position cache: `maia_cache(fen, maia_version)` and
  `stockfish_cache(fen, sf_version, depth)` in Postgres. Maia outputs are
  full per-rating-bucket move-probability distributions stored as a
  `bytea` `Float32Array`. Access layer: `src/lib/position-cache/`.
- Maia-2 inference sidecar: Python uvicorn at `services/maia-inference/`,
  `POST /infer` (single FEN) and `POST /infer-batch` (K FENs in one
  forward pass). Rapid model variant; rating grid every 50 Elo from
  600 to 2600 (41 buckets). 11 unique coarse ELO buckets are batched
  via tensor stacking. See `.claude/rules/architecture.md` for the
  service contract.
- Aggregator: `src/lib/rating-aggregator/` — pure TS, consumes Maia
  output only. ε-flooring (default 1e-6) → log-likelihood across
  positions → log-sum-exp normalisation against a prior → posterior
  mean as point estimate, 5/95 percentiles as CI. Stockfish output
  is **not** consumed; SF cache populates for future feature work.
- Dispatcher: `src/lib/analysis-dispatcher/` — `ensureAnalyzed(fens,
  versions, cache, opts)` enqueues missing cache rows via pg-boss
  singleton-keyed jobs, optionally polls until satisfied. The eval
  harness uses `directBatch: true` (default) which calls /infer-batch
  directly, bypassing the queue.
- Eval harness: `src/lib/eval-harness/` + `scripts/eval-rating.ts`.
  Streams Lichess monthly PGN.zst (local file or http URL), two-pass
  samples, computes stratified MAE/RMSE/R²/CI-coverage + cache-hit
  metric. `--prior-sweep` and `--epsilon-sweep` flags for tuning.

## Prior choice: Gaussian(μ=1500, σ=400)
- Tuned via the Phase-6 eval harness `--prior-sweep` mode against
  Lichess Mar-2026 data (N=500 games / 1000 sides).
- Headline: MAE 210, RMSE 267, R² 0.50, CI coverage 82%.
- **Tail caveat (known limitation, not a bug):** the prior is
  optimised for the natural rating distribution, so the modal range
  (1200-2000) is excellent but tails are degraded:
  - <1000 players: MAE ~268 (modest upward bias)
  - 2200+ players: MAE ~330+ (strong downward shrinkage)
  - High-rated user complaints should trigger a prior re-tune, not
    a code fix. The prior is a config value (`EvalConfig.prior` and
    the production aggregator's `EstimatorOptions.prior`).
- Wider σ flattens band performance but loses ~14 Elo headline:
  G(1500, 600) MAE 224, modal 200-260 with no spike. Considered
  for a "fairness across users" mode if shipping to high-rated
  players seriously; not the v1 default.
- Asymmetric center (G(1600, 400)) does not justify the cost —
  helps 1600-2000 modestly but hurts <1400.
- Uniform prior was the original v1 default and produces 23%
  predictions pinned at the 2600 ceiling; do not revert.

## Why we do NOT use per-position downweighting
Per-position weighting (constant α<1 on each log-likelihood, or any
within-game informativeness scheme) is **deliberately rejected** even
though it would improve per-game CI calibration.

**Reason:** the same aggregator runs on per-game AND per-tag slices.
A tag-slice draws positions across many different games, so within-
game correlation is not the dominant problem there — positions are
arguably more independent in a tag-slice than in a single game. A
constant α calibrated on game-level CIs would *over-widen* tag-slice
CIs and silently degrade the headline product feature.

If a future calibration pass shows per-game CIs are clearly off and
per-tag CIs are clearly fine, a CONTEXT-AWARE weighting (different α
for game vs tag callsites) could be considered, but only with
explicit eval coverage on both. Constant α is wrong by construction.

The aggregator's `weights` parameter on `EstimatorOptions` still
exists (for future per-position-importance work like forced-move
detection). The eval harness intentionally never sets it.

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

## Windows
MVP supports a single window: `"trailing_20"` (most recent 20 games by
`played_at`). Window keys are opaque strings; add new ones to the
`tagSliceSchema` enum in `maia-queries.ts`.

## Tag-slice ratings
- Per-dimension Maia ratings are computed by `computeMaiaTagRatings` in
  `src/lib/scoring/maia-tag-rating.ts` and served by `getMaiaTagRatings`
  in `src/features/ratings/server/maia-queries.ts`.
- The hook is `useMaiaTagRatings({ playerId, dimensionType, windowKey, gameId? })`.
  When `gameId` is supplied, the window is restricted to that single game
  (game-detail view). When omitted, the trailing-20 window is used (profile view).
- Mapping to UI view models: `to-maia-factor.ts` (profile `Factor[]`) and
  `to-maia-game-factor.ts` (game-detail `GameFactor[]`).
- CI-based confidence: ciHigh - ciLow ≤ 200 → "high", 200–500 → "medium",
  > 500 → "low"; nPositions < 5 → suppress row entirely.

## Per-game headline rating
- Stored on `analysis_jobs` as `maia_predicted_white/black`, `maia_ci_low/high_*`,
  `maia_n_positions_*`. Populated by the `computeAndPersistMaiaRating` worker step.
- Hook: `useMaiaGameRating(analysisJobId)`.

## Player headline (overall) rating
- Aggregated by `aggregateRating` in `src/lib/rating-aggregator/recency.ts` over the
  player's per-game (player-side) ratings. Pure function; caller (profile server fn)
  fetches per-game scalars and passes them in.
- Weight per game = `exp(-ageDays / TAU_DAYS)` × inverse-variance of the per-game CI.
  TAU_DAYS = 60. Game-count cap = 500. Max age = 1095 days. CI weight cap ratio = 4
  (caps the inverse-variance component, NOT combined weight — capping combined
  weight would erase the recency intent).
- Aggregate CI is the wider of `1.96 × √(weightedVar / effectiveN)` and
  `avgPerGameHalfWidth / √(effectiveN)`. The floor avoids a zero-CI degenerate
  result when only one game exists (variance=0, effectiveN=1).
- Server fn: `getPlayerSummary` returns `eloEstimate` (rounded posterior mean) and
  `eloDelta30d` (current minus an aggregate computed at `now - 30d`).

## Rating-over-time trend
- `aggregateRatingTrend` reuses `aggregateRating` once per snapshot date with
  `now = snapshot` and games filtered to `playedAt ≤ snapshot`. Pure function.
- Server fn: `getRatingTrend({ playerId, range })` where `range ∈ "1m"|"3m"|"6m"|"1y"|"all"`.
  Snapshot dates are the actual game dates inside the window, decimated to at most
  `MAX_TREND_POINTS = 60` so the chart only moves where data changes.
- Returned points have integer ratings (`Math.round`). UI hover shows the date
  (formatted from the original ISO string) and the rounded rating.
- Hook: inline `useQuery` in `RatingOverTimeCard`. The card has no white/black toggle;
  the player's side is selected at the per-game level upstream in `fetchPerGameRatings`.

## Position-level recency in the MLE aggregator
- `estimateRating` (`src/lib/rating-aggregator/index.ts`) accepts optional `now` and
  `tauDays`. When both are set AND a position has `playedAt`, that position's weight
  is multiplied by `exp(-ageDays / tauDays)`.
- Used by `computeMaiaTagRatings` (dimensional ratings) so a tag-slice's positions
  drawn from old games decay the same way the per-game aggregator decays old games.
- Per-game scoring (`estimateGameSideRating`) does NOT pass `now`/`tauDays` —
  positions in a single game share the same date, so recency would factor out anyway.
- Tau is shared (60 days) so the headline elo and dimensional ratings move on the
  same timescale.

## Legacy pipeline (deleted)
Phases 1-3 (accuracy-based scoring, complexity weighting, multivariate OLS,
LightGBM) were deleted in the Maia-2 rearchitecture cleanup. The following
files no longer exist:
- `src/lib/scoring/{shrinkage,rating-mapping,weighted-accuracy,complexity,game-features,lgbm-inference,multivariate-regression,cache}.ts`
- `src/features/ratings/server/queries.ts` (legacy `getDimensionScores*`)
- `src/features/ratings/utils/{to-factor,to-game-factor}.ts`
- `src/features/ratings/hooks/{use-dimension-ratings,use-game-dimension-ratings}.ts`
- `src/features/profile/hooks/use-rating-trend.ts`
- `scripts/{eval-phase1,eval-phase2,eval-phase3,train-phase3,calibrate-rating-formula,build-eval-cache,benchmark-analysis}.ts/py`

Retained from legacy pipeline:
- `src/lib/scoring/game-accuracy.ts` — used by `analyze-game` worker to populate `accuracy_white/black` on `analysis_jobs` (displayed in game list)
- `src/lib/scoring/rating-mapping.ts` — used by `features/games/server/queries.ts` to map per-game accuracy to an Elo-scale `gameScore` in the game list
- `accuracy_white/black` columns on `analysis_jobs` — still populated by worker and displayed in game list
- `accuracy_score` on `moves` — still populated by worker; kept for future use (default: KEEP per spec)

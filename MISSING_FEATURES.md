# Missing Features — Backend Work Required

This file tracks every piece of mock data rendered in the UI that needs a real backend implementation before it can go live.

Items marked **[REAL]** are already wired to real backend data.

---

## elo-estimate [REAL — partial]

**What the UI shows:** A single "Elo estimate" number with a 30-day delta.

**Current state:** The UI shows the player's most recent chess.com game rating as a v1 stand-in. `getPlayerSummary` returns `eloEstimate: currentRating` (the rating from the most recent game in the DB) and `eloDelta30d` (difference vs the rating ~30 days ago).

**What's still needed for v2:**
- A unified cross-platform Elo rating derived from game results, opponent ratings, and timestamps (similar to Glicko-2).
- Currently the estimate is just "what chess.com says your rating is" — it's not independently computed.

---

## imported-ratings [REAL — chess.com only]

**What the UI shows:** Chess.com imported rating (current rating + game count) in the Elo estimate card.

**Current state:** Real. `getPlayerSummary` reads `currentRating` (most recent `playerRating`) and `gameCount` from the DB.

**Lichess removed:** Lichess support is fully out of scope until a `player_accounts` schema change is made. The UI shows only the Chess.com row.

**What's still needed:**
- Schema change for multi-platform: `player_accounts` table with one row per platform.
- Lichess sync worker job.

---

## rating-over-time [REAL]

**What the UI shows:** A line chart of weekly ratings over a selectable range (4w / 6m / 1y / all).

**Current state:** Real. `getRatingTrend(username, range)` buckets games by Monday-UTC week, averages `playerRating` per week, returns `{ weekStart, rating }[]`. Powered by data already stored in the `games` table.

---

## factor-ratings

**What the UI shows:** Per-factor Elo-scale ratings (e.g. Endgame: 1380, Tactics: 1712) with delta pills, sorted weakest-first.

**What's needed:**
- A mapping from accuracy % (which we already have via `getPlayerProfile`) to an Elo-scale number. This is a product decision — the simplest approach is a linear mapping against the player's overall Elo estimate.
- Currently we have `playerProfile.phaseStats`, `pieceStats`, `conceptStats` as accuracy percentages — not Elo-scale.

**Currently shown as:** `mockFactors` — hardcoded Elo-scale values and deltas.

---

## focus-areas

**What the UI shows:** Three curated "focus area" tiles (e.g. "Knight endgames", "Decisions under time pressure") with gap deltas, related factor tags, and position counts.

**What's needed:**
- A new `focus_areas` DB table.
- A new LLM-generated prompt (e.g. `focus-areas-v1`) that takes the player's factor breakdown and produces 2–4 curated weakness clusters with title, description, and related concepts.
- This would likely run as a background job triggered after analysis completes or on a weekly schedule.

**Currently shown as:** `mockFocusAreas` — hardcoded mock clusters.

---

## game-score

**What the UI shows:** A per-game "game score" (Elo-scale) in the Recent Games table, with a colored mini bar.

**What's needed:**
- Same Elo-scale mapping problem as factor-ratings: we have `overallAccuracy` per game, but not an Elo-scale value.
- A `game_score` column on `game_analyses` computed from accuracy → Elo using the same mapping as factor-ratings.

**Currently shown as:** `—` (null placeholder) for all games.

---

## recent-games [REAL]

**What the UI shows:** Recent games table with opponent, result, color, opening, time control, accuracy, and played-at.

**Current state:** Real. `useRecentGames` calls `listGames` server fn and transforms to `RecentGame[]`. Accuracy is real (`accuracyWhite` / `accuracyBlack` depending on player color). Game score is shown as `—` until the Elo-scale mapping is built.

---

## review-last-game

**What the UI shows:** A "Review last game" button in the Topbar that (in the design) navigates to the most recent analyzed game.

**What's needed:**
- A thin server function: `getMostRecentAnalyzedGame(username)` — `listGames` with `limit: 1, orderBy: playedAt desc, analysis_status = 'complete'`.
- The game detail route (`/$username/games/$gameId`) is currently deleted and needs to be rebuilt as part of the Game page redesign.

**Currently shown as:** A non-functional button (click handler not wired).

---

## cross-platform-accounts

**What the UI shows (future):** Both chess.com and Lichess imported ratings.

**What's needed:**
- Schema change: a `player_accounts` join table (`player_id`, `platform`, `external_username`, `current_rating`, `game_count`, `synced_at`).
- Lichess sync worker job.
- Updated `getPlayerSummary` to return accounts for all platforms.

**Current state:** Lichess support is fully removed from the UI. Chess.com only.

/**
 * Elo Estimate Formula
 *
 * Maps move-quality accuracy (0–100 %) to an approximate Elo rating.
 *
 * Formula: elo = SLOPE × accuracy% − INTERCEPT
 *
 * Calibration reference points (empirical linear fit):
 *   60 % accuracy  → ~1200  (beginner / casual)
 *   70 % accuracy  → ~1600  (club player)
 *   80 % accuracy  → ~2000  (expert / candidate master)
 *   90 % accuracy  → ~2400  (grandmaster)
 *   99 % accuracy  → ~2760  (Magnus Carlsen peak ≈ 2830)
 *
 * Our accuracy is move-classification-based (brilliant/best/good = accurate,
 * inaccuracy/mistake/blunder = not). This differs from chess.com's winrate-
 * based formula, but the linear relationship holds similarly in the 1000–2200
 * range where most users sit.
 *
 * If the numbers feel systematically off, adjust SLOPE and INTERCEPT together:
 *   - SLOPE     = Elo points per 1 % accuracy (empirical value: 40)
 *   - INTERCEPT = offset so the zero-accuracy floor is reasonable
 *
 * Always average accuracy over many games before calling this — single-game
 * accuracy has high variance; the estimate converges after ~20+ analyzed games.
 */

const SLOPE = 40;
const INTERCEPT = 1200;
const MIN_ELO = 400;
const MAX_ELO = 3000;

/**
 * Convert an accuracy percentage (0–100) to an estimated Elo rating.
 * Result is clamped to [MIN_ELO, MAX_ELO] and rounded to the nearest integer.
 */
export function accuracyToElo(accuracyPct: number): number {
	const raw = SLOPE * accuracyPct - INTERCEPT;
	return Math.round(Math.min(MAX_ELO, Math.max(MIN_ELO, raw)));
}

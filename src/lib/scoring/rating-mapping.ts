import { accuracyToElo } from "#/lib/elo-estimate";

/**
 * Maps a (potentially shrunk) accuracy score to an Elo estimate.
 *
 * Single chokepoint so future per-dimension scaling — e.g. an "endgame
 * accuracy → endgame Elo" curve that differs from the global one — can be
 * added here without touching the scoring engine or call sites.
 */
export function accuracyToRating(accuracyPct: number): number {
	return accuracyToElo(accuracyPct);
}

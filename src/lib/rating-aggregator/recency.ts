/**
 * Recency-weighted aggregator over per-game rating estimates.
 *
 * Combines each game's posterior mean and CI into a single "current" rating.
 * Weight = recency × inverse-variance (CI width^-2), with a CI weight cap
 * to prevent any one game dominating the aggregate forever.
 *
 * Pure function. No I/O. The caller fetches per-game ratings and passes them in.
 */

export type PerGameRating = {
	rating: number;
	ciLow: number;
	ciHigh: number;
	playedAt: Date;
};

export type AggregateOptions = {
	tauDays?: number;
	maxGames?: number;
	maxAgeDays?: number;
	ciWeightCapRatio?: number;
	now?: Date;
};

export type AggregateRating = {
	rating: number;
	ciLow: number;
	ciHigh: number;
	effectiveN: number;
	totalGames: number;
};

export const DEFAULT_TAU_DAYS = 60;
export const DEFAULT_MAX_GAMES = 500;
export const DEFAULT_MAX_AGE_DAYS = 1095; // 3 years
export const DEFAULT_CI_WEIGHT_CAP_RATIO = 4;

const MS_PER_DAY = 86_400_000;
const MIN_CI_WIDTH = 1; // guard divide-by-zero on degenerate CIs

function ageDays(now: Date, playedAt: Date): number {
	return Math.max(0, (now.getTime() - playedAt.getTime()) / MS_PER_DAY);
}

function selectActiveGames(
	games: PerGameRating[],
	now: Date,
	maxGames: number,
	maxAgeDays: number,
): PerGameRating[] {
	const fresh = games.filter((g) => ageDays(now, g.playedAt) <= maxAgeDays);
	fresh.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
	return fresh.slice(0, maxGames);
}

function invVariance(game: PerGameRating): number {
	const width = Math.max(MIN_CI_WIDTH, game.ciHigh - game.ciLow);
	return 1 / (width * width);
}

function recencyFactor(
	game: PerGameRating,
	now: Date,
	tauDays: number,
): number {
	return Math.exp(-ageDays(now, game.playedAt) / tauDays);
}

/** Cap inverse-variance weights so the tightest CI is at most `capRatio`× the widest. */
function capInvVariance(invVars: number[], capRatio: number): number[] {
	if (invVars.length === 0) return invVars;
	let min = Infinity;
	for (const w of invVars) if (w < min) min = w;
	if (min <= 0 || !Number.isFinite(min)) return invVars;
	const ceiling = min * capRatio;
	return invVars.map((w) => Math.min(w, ceiling));
}

export function aggregateRating(
	games: PerGameRating[],
	options?: AggregateOptions,
): AggregateRating | null {
	const tauDays = options?.tauDays ?? DEFAULT_TAU_DAYS;
	const maxGames = options?.maxGames ?? DEFAULT_MAX_GAMES;
	const maxAgeDays = options?.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
	const capRatio = options?.ciWeightCapRatio ?? DEFAULT_CI_WEIGHT_CAP_RATIO;
	const now = options?.now ?? new Date();

	const active = selectActiveGames(games, now, maxGames, maxAgeDays);
	if (active.length === 0) return null;

	const cappedInvVars = capInvVariance(active.map(invVariance), capRatio);
	const weights = active.map(
		(g, i) => recencyFactor(g, now, tauDays) * (cappedInvVars[i] ?? 0),
	);

	const sumW = weights.reduce((a, b) => a + b, 0);
	if (sumW <= 0) return null;

	const mean =
		weights.reduce((acc, w, i) => acc + w * (active[i]?.rating ?? 0), 0) / sumW;

	const weightedVar =
		weights.reduce((acc, w, i) => {
			const diff = (active[i]?.rating ?? 0) - mean;
			return acc + w * diff * diff;
		}, 0) / sumW;

	const sumW2 = weights.reduce((a, b) => a + b * b, 0);
	const effectiveN = sumW2 > 0 ? (sumW * sumW) / sumW2 : 0;

	// Variance of the weighted mean is weightedVar / effectiveN.
	// Bound the half-width by the average per-game CI half-width — with one
	// game effectiveN=1 and weightedVar=0, so we'd otherwise emit a zero CI.
	const avgHalfWidth =
		active.reduce((acc, g) => acc + (g.ciHigh - g.ciLow) / 2, 0) /
		active.length;
	const stdHalfWidth = effectiveN > 0 ? Math.sqrt(weightedVar / effectiveN) : 0;
	const halfWidth = Math.max(
		1.96 * stdHalfWidth,
		avgHalfWidth / Math.sqrt(effectiveN),
	);

	return {
		rating: mean,
		ciLow: mean - halfWidth,
		ciHigh: mean + halfWidth,
		effectiveN,
		totalGames: active.length,
	};
}

export type TrendPoint = {
	date: Date;
	aggregate: AggregateRating;
};

export function aggregateRatingTrend(
	games: PerGameRating[],
	snapshotDates: Date[],
	options?: AggregateOptions,
): TrendPoint[] {
	const points: TrendPoint[] = [];
	for (const date of snapshotDates) {
		const eligible = games.filter(
			(g) => g.playedAt.getTime() <= date.getTime(),
		);
		const aggregate = aggregateRating(eligible, { ...options, now: date });
		if (aggregate !== null) points.push({ date, aggregate });
	}
	return points;
}

/**
 * Rating band boundaries and helpers.
 * 9 bands: <1000, 1000-1200, ..., 2200-2400, ≥2400
 */

export type RatingBand = {
	label: string;
	low: number;
	high: number;
};

export const RATING_BANDS: RatingBand[] = [
	{ label: "<1000", low: 0, high: 999 },
	{ label: "1000-1200", low: 1000, high: 1199 },
	{ label: "1200-1400", low: 1200, high: 1399 },
	{ label: "1400-1600", low: 1400, high: 1599 },
	{ label: "1600-1800", low: 1600, high: 1799 },
	{ label: "1800-2000", low: 1800, high: 1999 },
	{ label: "2000-2200", low: 2000, high: 2199 },
	{ label: "2200-2400", low: 2200, high: 2399 },
	{ label: "≥2400", low: 2400, high: Number.MAX_SAFE_INTEGER },
];

/** Returns the band index (0-based) for a given rating. Returns -1 if out of range. */
export function bandIndexFor(rating: number): number {
	for (let i = 0; i < RATING_BANDS.length; i++) {
		const b = RATING_BANDS[i];
		if (rating >= b.low && rating <= b.high) return i;
	}
	return -1;
}

/** Returns the band label for a given rating, or "unknown" if out of range. */
export function bandFor(rating: number): string {
	return RATING_BANDS[bandIndexFor(rating)]?.label ?? "unknown";
}

/** The boundary arrays for TwoPassSampler (array of [low, high] per band). */
export const BAND_BOUNDARIES: number[][] = RATING_BANDS.map((b) => [
	b.low,
	b.high,
]);

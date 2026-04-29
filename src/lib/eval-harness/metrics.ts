import type { EvalRow } from "./evaluate-game";
import { bandFor } from "./rating-bands";

export type MetricSet = {
	mae: number;
	mse: number;
	rmse: number;
	r2: number;
	ciCoverage: number;
	n: number;
};

export type CacheMetrics = {
	cacheHitRate: number;
	totalUniquePositions: number;
};

export type StratifiedMetrics = {
	overall: MetricSet & CacheMetrics;
	byRatingBand: Array<{ band: string } & MetricSet>;
	byPositionCount: Array<{ bucket: string } & MetricSet>;
	byTimeControl: Array<{ class: string } & MetricSet>;
};

function computeMetricSet(rows: EvalRow[]): MetricSet {
	if (rows.length === 0) {
		return { mae: 0, mse: 0, rmse: 0, r2: 0, ciCoverage: 0, n: 0 };
	}

	const n = rows.length;
	const mean = rows.reduce((s, r) => s + r.trueRating, 0) / n;
	let ssTot = 0;
	let ssRes = 0;
	let sumAe = 0;
	let sumSe = 0;
	let withinCi = 0;

	for (const row of rows) {
		const err = row.predicted - row.trueRating;
		sumAe += Math.abs(err);
		sumSe += err * err;
		ssTot += (row.trueRating - mean) ** 2;
		ssRes += err * err;
		if (row.withinCi) withinCi++;
	}

	const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
	const mse = sumSe / n;

	return {
		mae: sumAe / n,
		mse,
		rmse: Math.sqrt(mse),
		r2,
		ciCoverage: withinCi / n,
		n,
	};
}

function positionCountBucket(n: number): string {
	if (n < 5) return "<5";
	if (n < 10) return "5-9";
	if (n < 20) return "10-19";
	if (n < 40) return "20-39";
	if (n < 60) return "40-59";
	return "≥60";
}

function computeCacheMetrics(rows: EvalRow[]): CacheMetrics {
	if (rows.length === 0) {
		return { cacheHitRate: 0, totalUniquePositions: 0 };
	}
	// Rows are per-side but cache stats are game-level. Sum hits/misses across all rows
	// (each game contributes the same game-level numbers twice, once per side row).
	// Divide by 2 to avoid double-counting per-game stats.
	const totalHits = rows.reduce((s, r) => s + r.cacheHits, 0) / 2;
	const totalMisses = rows.reduce((s, r) => s + r.cacheMisses, 0) / 2;
	const totalUniquePositions =
		rows.reduce((s, r) => s + r.uniquePositions, 0) / 2;
	const total = totalHits + totalMisses;
	return {
		cacheHitRate: total === 0 ? 0 : totalHits / total,
		totalUniquePositions,
	};
}

export function computeStratifiedMetrics(rows: EvalRow[]): StratifiedMetrics {
	const overall = { ...computeMetricSet(rows), ...computeCacheMetrics(rows) };

	// By rating band
	const bandMap = new Map<string, EvalRow[]>();
	for (const row of rows) {
		const b = bandFor(row.trueRating);
		if (!bandMap.has(b)) bandMap.set(b, []);
		bandMap.get(b)!.push(row);
	}
	const byRatingBand = [...bandMap.entries()].map(([band, r]) => ({
		band,
		...computeMetricSet(r),
	}));

	// By position count bucket
	const bucketMap = new Map<string, EvalRow[]>();
	for (const row of rows) {
		const b = positionCountBucket(row.nPositions);
		if (!bucketMap.has(b)) bucketMap.set(b, []);
		bucketMap.get(b)!.push(row);
	}
	const byPositionCount = [...bucketMap.entries()].map(([bucket, r]) => ({
		bucket,
		...computeMetricSet(r),
	}));

	// By time control
	const tcMap = new Map<string, EvalRow[]>();
	for (const row of rows) {
		const t = row.timeControlClass;
		if (!tcMap.has(t)) tcMap.set(t, []);
		tcMap.get(t)!.push(row);
	}
	const byTimeControl = [...tcMap.entries()].map(([cls, r]) => ({
		class: cls,
		...computeMetricSet(r),
	}));

	return { overall, byRatingBand, byPositionCount, byTimeControl };
}

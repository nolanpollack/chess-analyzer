import { describe, expect, it } from "vitest";
import {
	aggregateRating,
	aggregateRatingTrend,
	DEFAULT_TAU_DAYS,
	type PerGameRating,
} from "./recency";

const NOW = new Date("2026-04-29T00:00:00Z");

function daysAgo(n: number): Date {
	return new Date(NOW.getTime() - n * 86_400_000);
}

function makeGame(overrides: Partial<PerGameRating>): PerGameRating {
	return {
		rating: 1500,
		ciLow: 1400,
		ciHigh: 1600,
		playedAt: NOW,
		...overrides,
	};
}

describe("aggregateRating", () => {
	it("returns null on empty input", () => {
		expect(aggregateRating([], { now: NOW })).toBeNull();
	});

	it("single game returns its rating", () => {
		const result = aggregateRating([makeGame({ rating: 1700 })], { now: NOW });
		expect(result).not.toBeNull();
		expect(result?.rating).toBeCloseTo(1700);
		expect(result?.totalGames).toBe(1);
	});

	it("two identical recent games tighten the CI", () => {
		const single = aggregateRating([makeGame({ rating: 1700 })], { now: NOW });
		const double = aggregateRating(
			[makeGame({ rating: 1700 }), makeGame({ rating: 1700 })],
			{ now: NOW },
		);
		expect(double?.rating).toBeCloseTo(1700);
		const singleWidth = (single?.ciHigh ?? 0) - (single?.ciLow ?? 0);
		const doubleWidth = (double?.ciHigh ?? 0) - (double?.ciLow ?? 0);
		expect(doubleWidth).toBeLessThan(singleWidth);
	});

	it("recent game beats old game with the same CI width", () => {
		const result = aggregateRating(
			[
				makeGame({ rating: 1200, playedAt: daysAgo(180) }),
				makeGame({ rating: 1800, playedAt: daysAgo(1) }),
			],
			{ now: NOW },
		);
		expect(result?.rating).toBeGreaterThan(1700);
	});

	it("drops games older than maxAgeDays", () => {
		const result = aggregateRating(
			[
				makeGame({ rating: 1200, playedAt: daysAgo(2000) }),
				makeGame({ rating: 1800, playedAt: daysAgo(1) }),
			],
			{ now: NOW },
		);
		expect(result?.totalGames).toBe(1);
		expect(result?.rating).toBeCloseTo(1800);
	});

	it("caps at maxGames most recent", () => {
		const games = Array.from({ length: 600 }, (_, i) =>
			makeGame({ rating: 1500, playedAt: daysAgo(i) }),
		);
		const result = aggregateRating(games, { now: NOW, maxGames: 500 });
		expect(result?.totalGames).toBe(500);
	});

	it("CI weight cap limits a tight-CI outlier's dominance", () => {
		// All games at the same age so the only difference is CI width.
		const tight = makeGame({
			rating: 1000,
			ciLow: 990,
			ciHigh: 1010,
			playedAt: daysAgo(1),
		});
		const loose = Array.from({ length: 20 }, () =>
			makeGame({
				rating: 1800,
				ciLow: 1600,
				ciHigh: 2000,
				playedAt: daysAgo(1),
			}),
		);
		const uncapped = aggregateRating([tight, ...loose], {
			now: NOW,
			ciWeightCapRatio: 1e9,
		});
		const capped = aggregateRating([tight, ...loose], {
			now: NOW,
			ciWeightCapRatio: 4,
		});
		expect(uncapped?.rating).toBeLessThan(1300);
		expect(capped?.rating).toBeGreaterThan((uncapped?.rating ?? 0) + 100);
	});

	it("recency tau ~60 days: 60-day-old game weight ~ 1/e of fresh", () => {
		const fresh = aggregateRating([makeGame({ rating: 2000, playedAt: NOW })], {
			now: NOW,
		});
		const old = aggregateRating(
			[
				makeGame({ rating: 2000, playedAt: NOW }),
				makeGame({ rating: 1000, playedAt: daysAgo(DEFAULT_TAU_DAYS) }),
			],
			{ now: NOW },
		);
		// fresh dominates; old game pulls down ~37% in weight
		// expected ratio of weights: e^-1 ≈ 0.368, so mean ≈ (2000 + 0.368*1000)/(1+0.368) ≈ 1731
		expect(fresh?.rating).toBeCloseTo(2000);
		expect(old?.rating).toBeGreaterThan(1600);
		expect(old?.rating).toBeLessThan(1900);
	});
});

describe("aggregateRatingTrend", () => {
	it("snapshot at date T excludes games played after T", () => {
		const games = [
			makeGame({ rating: 1500, playedAt: daysAgo(60) }),
			makeGame({ rating: 1900, playedAt: daysAgo(1) }),
		];
		const points = aggregateRatingTrend(games, [daysAgo(30), NOW], {
			now: NOW,
		});
		expect(points).toHaveLength(2);
		expect(points[0].aggregate.rating).toBeCloseTo(1500);
		expect(points[1].aggregate.rating).toBeGreaterThan(1500);
	});

	it("skips snapshots with no eligible games", () => {
		const games = [makeGame({ rating: 1500, playedAt: daysAgo(10) })];
		const points = aggregateRatingTrend(games, [daysAgo(30), NOW], {
			now: NOW,
		});
		expect(points).toHaveLength(1);
	});
});

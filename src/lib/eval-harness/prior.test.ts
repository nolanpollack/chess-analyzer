import { describe, expect, it } from "vitest";
import { buildPrior } from "./prior";

const GRID = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000];

describe("buildPrior", () => {
	it("uniform prior sums to 1.0", () => {
		const prior = buildPrior("uniform", GRID);
		const sum = prior.reduce((a, b) => a + b, 0);
		expect(sum).toBeCloseTo(1.0, 10);
	});

	it("uniform prior is uniform (all equal)", () => {
		const prior = buildPrior("uniform", GRID);
		const expected = 1 / GRID.length;
		for (const p of prior) {
			expect(p).toBeCloseTo(expected, 10);
		}
	});

	it("lichess-empirical prior sums to 1.0", () => {
		const prior = buildPrior("lichess-empirical", GRID);
		const sum = prior.reduce((a, b) => a + b, 0);
		expect(sum).toBeCloseTo(1.0, 5);
	});

	it("lichess-empirical peaks near 1500", () => {
		const prior = buildPrior("lichess-empirical", GRID);
		const maxIdx = prior.indexOf(Math.max(...prior));
		const peakRating = GRID[maxIdx];
		expect(peakRating).toBeGreaterThanOrEqual(1300);
		expect(peakRating).toBeLessThanOrEqual(1700);
	});

	it("gaussian prior sums to 1.0", () => {
		const prior = buildPrior({ gaussian: { mean: 1500, std: 400 } }, GRID);
		const sum = prior.reduce((a, b) => a + b, 0);
		expect(sum).toBeCloseTo(1.0, 5);
	});

	it("gaussian prior peaks at mean", () => {
		const prior = buildPrior({ gaussian: { mean: 1500, std: 100 } }, GRID);
		const maxIdx = prior.indexOf(Math.max(...prior));
		expect(GRID[maxIdx]).toBe(1500);
	});

	it("gaussian with narrow std is more concentrated", () => {
		const wide = buildPrior({ gaussian: { mean: 1500, std: 400 } }, GRID);
		const narrow = buildPrior({ gaussian: { mean: 1500, std: 100 } }, GRID);
		const midIdx = GRID.indexOf(1500);
		expect(narrow[midIdx]).toBeGreaterThan(wide[midIdx]);
	});
});

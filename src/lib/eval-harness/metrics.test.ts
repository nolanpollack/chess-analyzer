import { describe, expect, it } from "vitest";
import type { EvalRow } from "./evaluate-game";
import { computeStratifiedMetrics } from "./metrics";

function makeRow(overrides: Partial<EvalRow> = {}): EvalRow {
	return {
		gameId: "g1",
		side: "white",
		trueRating: 1500,
		opponentRating: 1500,
		timeControlClass: "blitz",
		nPositions: 20,
		predicted: 1500,
		ciLow: 1400,
		ciHigh: 1600,
		withinCi: true,
		...overrides,
	};
}

describe("computeStratifiedMetrics", () => {
	it("computes MSE correctly", () => {
		const rows = [
			makeRow({ trueRating: 1000, predicted: 1100 }), // err=100
			makeRow({ trueRating: 1000, predicted: 900 }), // err=100
		];
		const { overall } = computeStratifiedMetrics(rows);
		expect(overall.mse).toBeCloseTo(10000, 1); // (100^2 + 100^2) / 2
	});

	it("computes MAE correctly", () => {
		const rows = [
			makeRow({ trueRating: 1000, predicted: 1200 }), // err=200
			makeRow({ trueRating: 1000, predicted: 800 }), // err=200
		];
		const { overall } = computeStratifiedMetrics(rows);
		expect(overall.mae).toBeCloseTo(200, 1);
	});

	it("computes R² = 1 for perfect predictions", () => {
		const rows = [
			makeRow({ trueRating: 1200, predicted: 1200 }),
			makeRow({ trueRating: 1500, predicted: 1500 }),
			makeRow({ trueRating: 1800, predicted: 1800 }),
		];
		const { overall } = computeStratifiedMetrics(rows);
		expect(overall.r2).toBeCloseTo(1.0, 5);
	});

	it("computes CI coverage correctly", () => {
		const rows = [
			makeRow({ withinCi: true }),
			makeRow({ withinCi: true }),
			makeRow({ withinCi: false }),
			makeRow({ withinCi: false }),
		];
		const { overall } = computeStratifiedMetrics(rows);
		expect(overall.ciCoverage).toBeCloseTo(0.5, 5);
	});

	it("stratifies by rating band", () => {
		const rows = [
			makeRow({ trueRating: 1000, predicted: 1000 }), // 1000-1200
			makeRow({ trueRating: 1500, predicted: 1500 }), // 1400-1600
			makeRow({ trueRating: 1500, predicted: 1600 }), // 1400-1600
		];
		const { byRatingBand } = computeStratifiedMetrics(rows);
		const blitz = byRatingBand.find((b) => b.band === "1400-1600");
		expect(blitz?.n).toBe(2);
		const below1200 = byRatingBand.find((b) => b.band === "1000-1200");
		expect(below1200?.n).toBe(1);
	});

	it("stratifies by time control", () => {
		const rows = [
			makeRow({ timeControlClass: "blitz" }),
			makeRow({ timeControlClass: "blitz" }),
			makeRow({ timeControlClass: "rapid" }),
		];
		const { byTimeControl } = computeStratifiedMetrics(rows);
		expect(byTimeControl.find((t) => t.class === "blitz")?.n).toBe(2);
		expect(byTimeControl.find((t) => t.class === "rapid")?.n).toBe(1);
	});

	it("stratifies by position count bucket", () => {
		const rows = [
			makeRow({ nPositions: 3 }),
			makeRow({ nPositions: 7 }),
			makeRow({ nPositions: 25 }),
		];
		const { byPositionCount } = computeStratifiedMetrics(rows);
		expect(byPositionCount.find((b) => b.bucket === "<5")?.n).toBe(1);
		expect(byPositionCount.find((b) => b.bucket === "5-9")?.n).toBe(1);
		expect(byPositionCount.find((b) => b.bucket === "20-39")?.n).toBe(1);
	});

	it("handles empty rows gracefully", () => {
		const { overall } = computeStratifiedMetrics([]);
		expect(overall.n).toBe(0);
		expect(overall.mae).toBe(0);
	});
});

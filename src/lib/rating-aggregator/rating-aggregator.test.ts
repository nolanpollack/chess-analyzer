import { describe, expect, it } from "vitest";
import type { MaiaOutput } from "#/lib/position-cache/types";
import { estimateRating } from "./index";
import type { Position } from "./types";

// ── Helpers ────────────────────────────────────────────────────────────

/** 5-bucket rating grid, 3-move move index */
const RATING_GRID = [1000, 1250, 1500, 1750, 2000];
const MOVE_INDEX = ["e2e4", "d2d4", "c2c4"];

/**
 * Builds a MaiaOutput where the played move has probability `peakProb` at
 * `peakRatingIndex` and `offProb` elsewhere, and other moves share the
 * remaining probability.
 */
function makeMaia(
	peakRatingIndex: number,
	peakProb: number,
	offProb = 0.05,
): MaiaOutput {
	const nRatings = RATING_GRID.length;
	const nMoves = MOVE_INDEX.length;
	const probs = new Float32Array(nRatings * nMoves);

	for (let r = 0; r < nRatings; r++) {
		const p0 = r === peakRatingIndex ? peakProb : offProb;
		const remaining = (1 - p0) / (nMoves - 1);
		probs[r * nMoves + 0] = p0; // e2e4 is the "played" move
		probs[r * nMoves + 1] = remaining;
		probs[r * nMoves + 2] = remaining;
	}

	return {
		ratingGrid: RATING_GRID,
		moveIndex: MOVE_INDEX,
		probabilities: probs,
	};
}

function makePosition(maia: MaiaOutput, playedMove = "e2e4"): Position {
	return {
		fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		playedMove,
		maia,
	};
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("1. Posterior sums to 1", () => {
	it("sums to 1 for any non-trivial input", () => {
		const maia = makeMaia(2, 0.7);
		const result = estimateRating([makePosition(maia)]);
		const sum = result.posterior.reduce((a, b) => a + b, 0);
		expect(sum).toBeCloseTo(1.0, 10);
	});
});

describe("2. Single position peaked at 1500", () => {
	it("point estimate is within 25 of 1500", () => {
		const maia = makeMaia(2, 0.9); // index 2 = 1500
		const result = estimateRating([makePosition(maia)]);
		expect(Math.abs(result.pointEstimate - 1500)).toBeLessThan(25);
	});
});

describe("3. Two positions both peaked at 1500", () => {
	it("point estimate within 25 of 1500 and CI narrower than single position", () => {
		const maia = makeMaia(2, 0.9);
		const single = estimateRating([makePosition(maia)]);
		const double = estimateRating([makePosition(maia), makePosition(maia)]);

		expect(Math.abs(double.pointEstimate - 1500)).toBeLessThan(25);
		const singleWidth = single.ciHigh - single.ciLow;
		const doubleWidth = double.ciHigh - double.ciLow;
		expect(doubleWidth).toBeLessThan(singleWidth);
	});
});

describe("4. ε-flooring caps downside", () => {
	it("log-likelihood is exactly log(ε) when prob is 0 in a bucket", () => {
		const epsilon = 1e-6;
		const nRatings = RATING_GRID.length;
		const nMoves = MOVE_INDEX.length;
		const probs = new Float32Array(nRatings * nMoves);

		// All probabilities for e2e4 are 0 (played move), except at index 2
		for (let r = 0; r < nRatings; r++) {
			probs[r * nMoves + 0] = r === 2 ? 0.9 : 0; // e2e4
			probs[r * nMoves + 1] = r === 2 ? 0.05 : 0.5;
			probs[r * nMoves + 2] = r === 2 ? 0.05 : 0.5;
		}

		const maia: MaiaOutput = {
			ratingGrid: RATING_GRID,
			moveIndex: MOVE_INDEX,
			probabilities: probs,
		};
		const result = estimateRating([makePosition(maia)], { epsilon });

		// Bucket 0 (r=0) has prob 0 → should be log(epsilon)
		expect(result.logLikelihoodPerPosition[0]?.[0]).toBeCloseTo(
			Math.log(epsilon),
			10,
		);
		// Should NOT be -Infinity
		expect(result.logLikelihoodPerPosition[0]?.[0]).toBeGreaterThan(-Infinity);
	});
});

describe("5. Played move not in moveIndex", () => {
	it("handled gracefully — log = log(ε), no throw", () => {
		const epsilon = 1e-6;
		const maia = makeMaia(2, 0.7);
		const pos: Position = { ...makePosition(maia), playedMove: "g1f3" }; // not in moveIndex
		const result = estimateRating([pos], { epsilon });
		expect(result.logLikelihoodPerPosition[0]?.[0]).toBeCloseTo(
			Math.log(epsilon),
			10,
		);
	});
});

describe("6. Uniform prior is the default", () => {
	it("explicit uniform prior matches default", () => {
		const maia = makeMaia(2, 0.7);
		const pos = makePosition(maia);

		const withDefault = estimateRating([pos]);
		const uniformPrior = RATING_GRID.map(() => 1 / RATING_GRID.length);
		const withExplicit = estimateRating([pos], { prior: uniformPrior });

		for (let r = 0; r < RATING_GRID.length; r++) {
			expect(withDefault.posterior[r]).toBeCloseTo(
				withExplicit.posterior[r] ?? 0,
				10,
			);
		}
	});
});

describe("7. Heavy prior overwhelms small N", () => {
	it("biases point estimate toward prior peak at 1000 despite Maia peak at 1500", () => {
		const maia = makeMaia(2, 0.9); // peaked at 1500

		// Prior heavily peaked at 1000 (index 0)
		const prior = [0.95, 0.01, 0.01, 0.01, 0.02];
		const result = estimateRating([makePosition(maia)], { prior });

		// With a very strong prior at 1000, point estimate should be closer to 1000
		expect(result.pointEstimate).toBeLessThan(1300);
	});
});

describe("8. CI contains point estimate", () => {
	it("ciLow <= pointEstimate <= ciHigh for various inputs", () => {
		const cases = [
			makeMaia(0, 0.9),
			makeMaia(2, 0.9),
			makeMaia(4, 0.9),
			makeMaia(2, 0.4),
		];
		for (const maia of cases) {
			const result = estimateRating([makePosition(maia)]);
			expect(result.ciLow).toBeLessThanOrEqual(result.pointEstimate + 1e-9);
			expect(result.ciHigh).toBeGreaterThanOrEqual(result.pointEstimate - 1e-9);
		}
	});
});

describe("9. Per-position rating", () => {
	it("peak position at 2000 bucket returns 2000 as per-position rating", () => {
		const nRatings = RATING_GRID.length;
		const nMoves = MOVE_INDEX.length;
		const probs = new Float32Array(nRatings * nMoves);

		// Played move (e2e4) has peak at index 4 (2000 bucket)
		for (let r = 0; r < nRatings; r++) {
			probs[r * nMoves + 0] = r === 4 ? 0.95 : 0.02; // e2e4
			probs[r * nMoves + 1] = 0.03;
			probs[r * nMoves + 2] = 0.03;
		}

		const maia: MaiaOutput = {
			ratingGrid: RATING_GRID,
			moveIndex: MOVE_INDEX,
			probabilities: probs,
		};
		const result = estimateRating([makePosition(maia)]);
		expect(result.perPositionRatings[0]).toBe(2000);
	});
});

describe("10. Error cases", () => {
	it("throws on empty positions", () => {
		expect(() => estimateRating([])).toThrow(
			"estimateRating requires at least one position",
		);
	});

	it("throws on mismatched rating grids", () => {
		const maia1 = makeMaia(2, 0.7);
		const maia2: MaiaOutput = {
			ratingGrid: [1100, 1300, 1500, 1700, 1900], // different grid
			moveIndex: MOVE_INDEX,
			probabilities: maia1.probabilities,
		};
		expect(() =>
			estimateRating([makePosition(maia1), makePosition(maia2)]),
		).toThrow("Mismatched rating grids");
	});

	it("throws on mismatched weight length", () => {
		const maia = makeMaia(2, 0.7);
		expect(() =>
			estimateRating([makePosition(maia)], { weights: [1, 2] }),
		).toThrow("weights.length");
	});
});

import { describe, expect, it } from "vitest";
import {
	computeWeightedAccuracy,
	computeWeightedAccuracySlice,
	type WeightedMove,
} from "./weighted-accuracy";

describe("computeWeightedAccuracy", () => {
	it("returns null for empty input", () => {
		expect(computeWeightedAccuracy([])).toBeNull();
	});

	it("returns null when one color has no moves", () => {
		// Only white moves — black side is null
		const moves: WeightedMove[] = [
			{ accuracy: 80, complexity: 10, isWhite: true },
		];
		expect(computeWeightedAccuracy(moves)).toBeNull();
	});

	it("falls back to EPSILON-weighted when all complexities are 0", () => {
		// All complexities = 0 → weights all equal EPSILON → plain harmonic mean
		const moves: WeightedMove[] = [
			{ accuracy: 80, complexity: 0, isWhite: true },
			{ accuracy: 60, complexity: 0, isWhite: true },
			{ accuracy: 90, complexity: 0, isWhite: false },
			{ accuracy: 70, complexity: 0, isWhite: false },
		];
		const result = computeWeightedAccuracy(moves);
		expect(result).not.toBeNull();
		// With equal weights, weighted harmonic mean == plain harmonic mean
		const whiteHM = 2 / (1 / 80 + 1 / 60);
		const blackHM = 2 / (1 / 90 + 1 / 70);
		expect(result?.white).toBeCloseTo(whiteHM, 0);
		expect(result?.black).toBeCloseTo(blackHM, 0);
	});

	it("down-weights a trivial blunder vs a complex-position blunder", () => {
		// Two white moves: one great (accuracy=95), one blunder (accuracy=20).
		// When the blunder is in an easy position (low complexity), it gets
		// downweighted and the aggregate is higher.
		// When the blunder is in a hard position (high complexity), it gets
		// upweighted and the aggregate is lower.

		// Scenario A: blunder in easy position (complexity=1), great move in hard (complexity=30)
		const movesA: WeightedMove[] = [
			{ accuracy: 95, complexity: 30, isWhite: true }, // great move, high weight
			{ accuracy: 20, complexity: 1, isWhite: true }, // blunder in trivial pos, low weight
			{ accuracy: 80, complexity: 1, isWhite: false },
		];
		// Scenario B: blunder in hard position (complexity=30), great move in easy (complexity=1)
		const movesB: WeightedMove[] = [
			{ accuracy: 95, complexity: 1, isWhite: true }, // great move, low weight
			{ accuracy: 20, complexity: 30, isWhite: true }, // blunder in hard pos, high weight
			{ accuracy: 80, complexity: 1, isWhite: false },
		];
		const resultA = computeWeightedAccuracy(movesA);
		const resultB = computeWeightedAccuracy(movesB);
		// Scenario A weights the blunder less → higher accuracy
		// Scenario B weights the blunder more → lower accuracy
		if (resultA === null || resultB === null)
			throw new Error("expected non-null");
		expect(resultA.white).toBeGreaterThan(resultB.white);
	});

	it("matches plain harmonic mean when all complexities are equal", () => {
		const moves: WeightedMove[] = [
			{ accuracy: 90, complexity: 15, isWhite: true },
			{ accuracy: 70, complexity: 15, isWhite: true },
			{ accuracy: 85, complexity: 15, isWhite: false },
			{ accuracy: 75, complexity: 15, isWhite: false },
		];
		const result = computeWeightedAccuracy(moves);
		const whiteHM = 2 / (1 / 90 + 1 / 70);
		const blackHM = 2 / (1 / 85 + 1 / 75);
		expect(result?.white).toBeCloseTo(whiteHM, 0);
		expect(result?.black).toBeCloseTo(blackHM, 0);
	});

	it("outputs values in [0, 100]", () => {
		const moves: WeightedMove[] = [
			{ accuracy: 100, complexity: 50, isWhite: true },
			{ accuracy: 100, complexity: 50, isWhite: false },
		];
		const result = computeWeightedAccuracy(moves);
		expect(result?.white).toBeGreaterThanOrEqual(0);
		expect(result?.white).toBeLessThanOrEqual(100);
	});
});

describe("computeWeightedAccuracySlice", () => {
	it("returns null for empty input", () => {
		expect(computeWeightedAccuracySlice([])).toBeNull();
	});

	it("returns a value for a single move", () => {
		const moves: WeightedMove[] = [
			{ accuracy: 75, complexity: 10, isWhite: true },
		];
		expect(computeWeightedAccuracySlice(moves)).toBeCloseTo(75, 0);
	});

	it("aggregates across colors correctly", () => {
		const moves: WeightedMove[] = [
			{ accuracy: 80, complexity: 10, isWhite: true },
			{ accuracy: 60, complexity: 10, isWhite: false },
		];
		const result = computeWeightedAccuracySlice(moves);
		// Equal weights → plain harmonic mean
		const expected = 2 / (1 / 80 + 1 / 60);
		expect(result).toBeCloseTo(expected, 0);
	});
});

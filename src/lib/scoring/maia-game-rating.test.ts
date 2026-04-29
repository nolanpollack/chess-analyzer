import { describe, expect, it } from "vitest";
import type { MaiaOutput } from "#/lib/position-cache";
import {
	estimateGameSideRating,
	PRODUCTION_MAIA_PRIOR,
	PRODUCTION_MAIA_VERSIONS,
} from "./maia-game-rating";

// Minimal synthetic MaiaOutput: 3 rating buckets, 2 legal moves
function makeMaiaOutput(
	ratingGrid: number[],
	moveIndex: string[],
	probs: number[],
): MaiaOutput {
	return {
		ratingGrid,
		moveIndex,
		probabilities: new Float32Array(probs),
	};
}

const RATING_GRID = [1200, 1500, 1800];
const MOVE_INDEX = ["e2e4", "d2d4"];

// Uniform probabilities across all buckets and moves
function uniformOutput(): MaiaOutput {
	// 3 ratings × 2 moves = 6 values; each row sums to 1.0
	return makeMaiaOutput(RATING_GRID, MOVE_INDEX, [
		0.5,
		0.5, // rating=1200
		0.5,
		0.5, // rating=1500
		0.5,
		0.5, // rating=1800
	]);
}

describe("estimateGameSideRating", () => {
	it("returns null for empty positions array", () => {
		const result = estimateGameSideRating("white", [], new Map());
		expect(result).toBeNull();
	});

	it("returns null when no positions have cached Maia data", () => {
		const positions = [
			{
				fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
				playedMove: "e2e4",
			},
		];
		const emptyMap = new Map<string, MaiaOutput>();
		const result = estimateGameSideRating("white", positions, emptyMap);
		expect(result).toBeNull();
	});

	it("returns a valid estimate for a single position", () => {
		const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
		const maia = uniformOutput();
		const maiaMap = new Map([[fen, maia]]);
		const positions = [{ fen, playedMove: "e2e4" }];

		const result = estimateGameSideRating("white", positions, maiaMap);

		expect(result).not.toBeNull();
		expect(result!.side).toBe("white");
		expect(result!.nPositions).toBe(1);
		expect(result!.predicted).toBeGreaterThan(0);
		expect(result!.ciLow).toBeLessThanOrEqual(result!.predicted);
		expect(result!.ciHigh).toBeGreaterThanOrEqual(result!.predicted);
	});

	it("returns a valid estimate for the black side", () => {
		const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
		const maia = uniformOutput();
		const maiaMap = new Map([[fen, maia]]);
		const positions = [{ fen, playedMove: "e7e5" }];

		const result = estimateGameSideRating("black", positions, maiaMap);

		expect(result).not.toBeNull();
		expect(result!.side).toBe("black");
	});

	it("skips positions missing from the Maia map (partial coverage)", () => {
		const fen1 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
		const fen2 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
		const maia = uniformOutput();
		// Only fen1 is cached
		const maiaMap = new Map([[fen1, maia]]);
		const positions = [
			{ fen: fen1, playedMove: "e2e4" },
			{ fen: fen2, playedMove: "e7e5" }, // not in cache
		];

		const result = estimateGameSideRating("white", positions, maiaMap);

		expect(result).not.toBeNull();
		expect(result!.nPositions).toBe(1);
	});

	it("nPositions equals number of positions with cache hits", () => {
		const fens = [
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
			"rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
		];
		const maia = uniformOutput();
		const maiaMap = new Map(fens.map((f) => [f, maia]));
		const positions = fens.map((fen) => ({ fen, playedMove: "e2e4" }));

		const result = estimateGameSideRating("white", positions, maiaMap);

		expect(result!.nPositions).toBe(2);
	});
});

describe("PRODUCTION_MAIA_PRIOR", () => {
	it("is G(1500, 400)", () => {
		expect(PRODUCTION_MAIA_PRIOR.gaussian.mean).toBe(1500);
		expect(PRODUCTION_MAIA_PRIOR.gaussian.std).toBe(400);
	});
});

describe("PRODUCTION_MAIA_VERSIONS", () => {
	it("exports the locked version string", () => {
		expect(PRODUCTION_MAIA_VERSIONS.maiaVersion).toBe("maia2-rapid-v1.0");
	});
});

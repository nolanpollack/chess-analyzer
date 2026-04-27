import { describe, expect, it } from "vitest";
import {
	extractGameFeatures,
	HIGH_COMPLEXITY_THRESHOLD,
} from "./game-features";

// ── Minimal fixtures ──────────────────────────────────────────────────────────

type Move = {
	ply: number;
	isWhite: boolean;
	san: string;
	uci: string;
	fenBefore: string;
	fenAfter: string;
	evalBeforeCp: number;
	evalAfterCp: number;
	pv2BeforeCp: number | null;
	bestMoveUci: string;
	bestMoveSan: string;
	complexity: number;
	accuracy: number;
	clockMs: number | null;
};

function makeMove(
	overrides: Partial<Move> & { ply: number; isWhite: boolean },
): Move {
	return {
		san: "e4",
		uci: "e2e4",
		fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
		evalBeforeCp: 0,
		evalAfterCp: 0,
		pv2BeforeCp: null,
		bestMoveUci: "e2e4",
		bestMoveSan: "e4",
		complexity: 3.0,
		accuracy: 90,
		clockMs: 300_000,
		...overrides,
	};
}

const BASE_GAME = {
	gameId: "test1",
	whiteElo: 1500,
	blackElo: 1600,
	timeControl: "300+0",
	timeControlClass: "blitz",
	result: "1-0",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("extractGameFeatures", () => {
	it("returns null for a color with no moves", () => {
		// Game where white has moves but we ask for black (none)
		const moves = [makeMove({ ply: 1, isWhite: true })];
		const result = extractGameFeatures({ ...BASE_GAME, moves }, "black");
		// black has no moves
		const whiteResult = extractGameFeatures({ ...BASE_GAME, moves }, "white");
		expect(whiteResult).not.toBeNull();
		// We replaced all moves with white-only, black should be filtered out
		// Actually the game has 1 move for white, 0 for black
		const blackResult = extractGameFeatures({ ...BASE_GAME, moves }, "black");
		expect(blackResult).toBeNull();
	});

	it("computes lichessAccuracy as mean of per-move accuracy values", () => {
		const moves = [
			makeMove({ ply: 1, isWhite: true, accuracy: 80 }),
			makeMove({ ply: 3, isWhite: true, accuracy: 60 }),
		];
		const features = extractGameFeatures({ ...BASE_GAME, moves }, "white");
		expect(features).not.toBeNull();
		expect(features!.lichessAccuracy).toBeCloseTo(70, 5);
	});

	it("partitions moves by HIGH_COMPLEXITY_THRESHOLD", () => {
		const moves = [
			makeMove({
				ply: 1,
				isWhite: true,
				complexity: HIGH_COMPLEXITY_THRESHOLD - 0.1,
				accuracy: 60,
			}),
			makeMove({
				ply: 3,
				isWhite: true,
				complexity: HIGH_COMPLEXITY_THRESHOLD + 0.1,
				accuracy: 80,
			}),
		];
		const features = extractGameFeatures({ ...BASE_GAME, moves }, "white");
		expect(features).not.toBeNull();
		expect(features!.lowComplexityCount).toBe(1);
		expect(features!.highComplexityCount).toBe(1);
		expect(features!.accuracyOnLowComplexity).toBeCloseTo(60);
		expect(features!.accuracyOnHighComplexity).toBeCloseTo(80);
	});

	it("falls back high-complexity accuracy to low when no high-complexity moves", () => {
		const moves = [
			makeMove({ ply: 1, isWhite: true, complexity: 1.0, accuracy: 75 }),
			makeMove({ ply: 3, isWhite: true, complexity: 2.0, accuracy: 85 }),
		];
		const features = extractGameFeatures({ ...BASE_GAME, moves }, "white");
		expect(features).not.toBeNull();
		expect(features!.highComplexityCount).toBe(0);
		// fallback: accuracyOnHighComplexity = accuracyOnLowComplexity
		expect(features!.accuracyOnHighComplexity).toBeCloseTo(
			features!.accuracyOnLowComplexity,
		);
	});

	it("computes blunderRate correctly", () => {
		const moves = [
			makeMove({ ply: 1, isWhite: true, accuracy: 30 }), // blunder (<50)
			makeMove({ ply: 3, isWhite: true, accuracy: 90 }), // not blunder
		];
		const features = extractGameFeatures({ ...BASE_GAME, moves }, "white");
		expect(features!.blunderRate).toBeCloseTo(0.5);
	});

	it("reports opponentRating correctly for each color", () => {
		const moves = [makeMove({ ply: 1, isWhite: true })];
		const featuresWhite = extractGameFeatures({ ...BASE_GAME, moves }, "white");
		expect(featuresWhite!.opponentRating).toBe(1600); // opponent of white = black

		const movesB = [makeMove({ ply: 2, isWhite: false })];
		const featuresBlack = extractGameFeatures(
			{ ...BASE_GAME, moves: movesB },
			"black",
		);
		expect(featuresBlack!.opponentRating).toBe(1500); // opponent of black = white
	});

	it("returns null time features when all clockMs are null", () => {
		const moves = [
			makeMove({ ply: 1, isWhite: true, clockMs: null }),
			makeMove({ ply: 3, isWhite: true, clockMs: null }),
		];
		const features = extractGameFeatures({ ...BASE_GAME, moves }, "white");
		expect(features).not.toBeNull();
		expect(features!.meanTimeSpentMs).toBeNull();
		expect(features!.meanTimeFractionUsed).toBeNull();
		expect(features!.blunderRateUnderPressure).toBeNull();
	});

	it("has correct moveCount", () => {
		const moves = [
			makeMove({ ply: 1, isWhite: true }),
			makeMove({ ply: 2, isWhite: false }),
			makeMove({ ply: 3, isWhite: true }),
		];
		const features = extractGameFeatures({ ...BASE_GAME, moves }, "white");
		expect(features!.moveCount).toBe(2);
	});
});

import { describe, expect, it } from "vitest";
import {
	classifyMove,
	computeAccuracy,
	computeEvalDelta,
	walkPgn,
} from "./chess-analysis";

describe("classifyMove", () => {
	it("returns 'best' when player plays the engine's best move", () => {
		expect(classifyMove(-5, "e2e4", "e2e4")).toBe("best");
	});

	it("returns 'brilliant' when eval delta exceeds +10 (rare improvement)", () => {
		expect(classifyMove(15, "d7d5", "e2e4")).toBe("brilliant");
	});

	it("returns 'good' when loss is under 50cp", () => {
		expect(classifyMove(-30, "d2d4", "e2e4")).toBe("good");
	});

	it("returns 'inaccuracy' when loss is between 50cp and 100cp", () => {
		expect(classifyMove(-60, "a2a3", "e2e4")).toBe("inaccuracy");
	});

	it("returns 'mistake' when loss is between 100cp and 200cp", () => {
		expect(classifyMove(-150, "h2h3", "e2e4")).toBe("mistake");
	});

	it("returns 'blunder' when loss is 200cp or more", () => {
		expect(classifyMove(-250, "g2g4", "e2e4")).toBe("blunder");
	});

	it("classifies at exact thresholds correctly", () => {
		// Exactly at inaccuracy threshold (50)
		expect(classifyMove(-50, "a2a3", "e2e4")).toBe("inaccuracy");
		// Exactly at mistake threshold (100)
		expect(classifyMove(-100, "a2a3", "e2e4")).toBe("mistake");
		// Exactly at blunder threshold (200)
		expect(classifyMove(-200, "a2a3", "e2e4")).toBe("blunder");
	});

	it("returns 'good' when eval delta is zero but not best move", () => {
		expect(classifyMove(0, "d2d4", "e2e4")).toBe("good");
	});
});

describe("computeAccuracy", () => {
	it("returns 0 for an empty array", () => {
		expect(computeAccuracy([])).toBe(0);
	});

	it("returns 100 when all moves are best", () => {
		expect(computeAccuracy(["best", "best", "best"])).toBe(100);
	});

	it("returns 0 when all moves are blunders", () => {
		expect(computeAccuracy(["blunder", "blunder"])).toBe(0);
	});

	it("counts brilliant, best, and good as accurate", () => {
		expect(computeAccuracy(["brilliant", "best", "good"])).toBe(100);
	});

	it("counts inaccuracy, mistake, blunder as inaccurate", () => {
		// 3 good + 3 bad = 50%
		expect(
			computeAccuracy([
				"best",
				"good",
				"brilliant",
				"inaccuracy",
				"mistake",
				"blunder",
			]),
		).toBe(50);
	});

	it("rounds to one decimal place", () => {
		// 1 out of 3 = 33.333...% → 33.3
		expect(computeAccuracy(["best", "blunder", "blunder"])).toBe(33.3);
	});
});

describe("computeEvalDelta", () => {
	it("returns positive delta when white gains advantage", () => {
		// White's move: eval goes from +100 to +200 → delta = +100
		expect(computeEvalDelta(100, 200, true)).toBe(100);
	});

	it("returns negative delta when white loses advantage", () => {
		// White's move: eval goes from +100 to -50 → delta = -150
		expect(computeEvalDelta(100, -50, true)).toBe(-150);
	});

	it("returns positive delta when black gains advantage", () => {
		// Black's move: eval goes from +100 to -50 → black gained, delta = +150
		expect(computeEvalDelta(100, -50, false)).toBe(150);
	});

	it("returns negative delta when black loses advantage", () => {
		// Black's move: eval goes from -100 to +50 → black lost, delta = -150
		expect(computeEvalDelta(-100, 50, false)).toBe(-150);
	});

	it("returns 0 when eval doesn't change", () => {
		expect(computeEvalDelta(50, 50, true)).toBe(0);
		// For black: -(50 - 50) = -0, which is equal to 0 in JS
		expect(computeEvalDelta(50, 50, false)).toEqual(-0);
	});
});

describe("walkPgn", () => {
	it("parses a simple game and returns moves with FEN positions", () => {
		const pgn = "1. e4 e5 2. Nf3 Nc6";
		const moves = walkPgn(pgn);

		expect(moves).toHaveLength(4);

		// First move: 1. e4
		expect(moves[0].ply).toBe(1);
		expect(moves[0].san).toBe("e4");
		expect(moves[0].isWhite).toBe(true);
		expect(moves[0].uci).toBe("e2e4");
		expect(moves[0].fenBefore).toContain("rnbqkbnr/pppppppp");

		// Second move: 1...e5
		expect(moves[1].ply).toBe(2);
		expect(moves[1].san).toBe("e5");
		expect(moves[1].isWhite).toBe(false);
		expect(moves[1].uci).toBe("e7e5");

		// Third move: 2. Nf3
		expect(moves[2].ply).toBe(3);
		expect(moves[2].san).toBe("Nf3");
		expect(moves[2].isWhite).toBe(true);
		expect(moves[2].uci).toBe("g1f3");
	});

	it("handles promotions in UCI notation", () => {
		// A position where a pawn promotes without giving check
		const pgn = '[FEN "8/P7/8/8/8/8/1k6/4K3 w - - 0 1"]\n\n1. a8=Q';
		const moves = walkPgn(pgn);

		expect(moves).toHaveLength(1);
		expect(moves[0].san).toBe("a8=Q");
		expect(moves[0].uci).toBe("a7a8q");
	});

	it("returns empty array for PGN with no moves", () => {
		const pgn = '[Event "Test"]\n\n*';
		const moves = walkPgn(pgn);
		expect(moves).toHaveLength(0);
	});

	it("produces different fenBefore and fenAfter for each move", () => {
		const pgn = "1. d4 d5";
		const moves = walkPgn(pgn);

		for (const move of moves) {
			expect(move.fenBefore).not.toBe(move.fenAfter);
		}
	});

	it("chains FENs so fenAfter[n] matches fenBefore[n+1]", () => {
		const pgn = "1. e4 e5 2. Nf3 Nc6 3. Bb5";
		const moves = walkPgn(pgn);

		for (let i = 0; i < moves.length - 1; i++) {
			expect(moves[i].fenAfter).toBe(moves[i + 1].fenBefore);
		}
	});
});

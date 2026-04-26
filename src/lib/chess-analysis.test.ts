import { describe, expect, it } from "vitest";
import {
	classifyMove,
	computeEvalDelta,
	cpToWinPct,
	getGamePhase,
	getPiecesInvolved,
	walkPgn,
} from "./chess-analysis";

describe("classifyMove", () => {
	const dummyFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

	it("returns 'best' when player plays the engine's best move", () => {
		expect(
			classifyMove(-5, "e2e4", "e2e4", 50, 45, dummyFen, dummyFen, true),
		).toBe("best");
	});

	it("returns 'brilliant' when piece is sacrificed, near best, not clearly winning, not losing after", () => {
		// e4: knight on f3 vs nothing (simulate sacrifice)
		const fenBefore =
			"r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
		const fenAfterSac =
			"r1bqkbnr/pppp1ppp/2n5/4p3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3"; // white knight removed
		expect(
			classifyMove(-40, "f3e5", "f3d4", 50, 10, fenBefore, fenAfterSac, true),
		).toBe("brilliant");
	});

	it("returns 'good' when loss is under 50cp", () => {
		expect(
			classifyMove(-30, "d2d4", "e2e4", 50, 20, dummyFen, dummyFen, true),
		).toBe("good");
	});

	it("returns 'inaccuracy' when loss is between 50cp and 100cp", () => {
		expect(
			classifyMove(-60, "a2a3", "e2e4", 50, -10, dummyFen, dummyFen, true),
		).toBe("inaccuracy");
	});

	it("returns 'mistake' when loss is between 100cp and 200cp", () => {
		expect(
			classifyMove(-150, "h2h3", "e2e4", 50, -100, dummyFen, dummyFen, true),
		).toBe("mistake");
	});

	it("returns 'blunder' when loss is 200cp or more", () => {
		expect(
			classifyMove(-250, "g2g4", "e2e4", 50, -200, dummyFen, dummyFen, true),
		).toBe("blunder");
	});

	it("classifies at exact thresholds correctly", () => {
		expect(
			classifyMove(-50, "a2a3", "e2e4", 50, 0, dummyFen, dummyFen, true),
		).toBe("inaccuracy");
		expect(
			classifyMove(-100, "a2a3", "e2e4", 50, -50, dummyFen, dummyFen, true),
		).toBe("mistake");
		expect(
			classifyMove(-200, "a2a3", "e2e4", 50, -150, dummyFen, dummyFen, true),
		).toBe("blunder");
	});

	it("returns 'good' when eval delta is zero but not best move", () => {
		expect(
			classifyMove(0, "d2d4", "e2e4", 50, 50, dummyFen, dummyFen, true),
		).toBe("good");
	});
});

describe("cpToWinPct", () => {
	it("returns 50 at 0 centipawns (equal position)", () => {
		expect(cpToWinPct(0)).toBeCloseTo(50, 5);
	});

	it("returns >50 for positive eval (white advantage)", () => {
		expect(cpToWinPct(100)).toBeGreaterThan(50);
	});

	it("returns <50 for negative eval (black advantage)", () => {
		expect(cpToWinPct(-100)).toBeLessThan(50);
	});

	it("is symmetric around 50", () => {
		expect(cpToWinPct(200) + cpToWinPct(-200)).toBeCloseTo(100, 5);
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

// ── getGamePhase ───────────────────────────────────────────────────────

describe("getGamePhase", () => {
	// Standard starting position — all pieces on board, material = 62
	const STARTING_FEN =
		"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

	it("returns 'opening' for early game with full material", () => {
		expect(getGamePhase(1, STARTING_FEN)).toBe("opening");
		expect(getGamePhase(10, STARTING_FEN)).toBe("opening");
		expect(getGamePhase(20, STARTING_FEN)).toBe("opening");
	});

	it("returns 'middlegame' after ply 20 with full material", () => {
		expect(getGamePhase(21, STARTING_FEN)).toBe("middlegame");
		expect(getGamePhase(40, STARTING_FEN)).toBe("middlegame");
	});

	it("returns 'middlegame' in early game if material dropped below 50 but queens remain", () => {
		// Queens still on board but lots of minor/major pieces traded.
		// q(9) + Q(9) + one rook(5) = 23, which is > 13 so not endgame by material.
		// But ply ≤ 20 and material < 50, so it falls to middlegame (not opening).
		const reducedMaterialFen = "4qk2/8/8/8/8/8/8/R2QK3 w - - 0 1"; // Q(9) + q(9) + R(5) = 23
		expect(getGamePhase(10, reducedMaterialFen)).toBe("middlegame");
	});

	it("returns 'endgame' when queens are off the board", () => {
		// Both queens removed from starting FEN
		const noQueensFen =
			"rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1";
		expect(getGamePhase(30, noQueensFen)).toBe("endgame");
	});

	it("returns 'endgame' when material is ≤ 13 even with queens", () => {
		// King + queen vs king + queen = material 18, not endgame
		// King + rook vs king = material 5, endgame
		const lowMaterialFen = "4k3/8/8/8/8/8/8/R3K3 w - - 0 1";
		expect(getGamePhase(40, lowMaterialFen)).toBe("endgame");
	});

	it("returns 'endgame' at exactly 13 material points", () => {
		// Rook (5) + rook (5) + knight (3) = 13
		const exactThresholdFen = "4k3/8/8/8/8/8/8/RNR1K3 w - - 0 1";
		expect(getGamePhase(30, exactThresholdFen)).toBe("endgame");
	});

	it("returns 'middlegame' at 14 material points with queens on", () => {
		// Queen (9) + rook (5) = 14 > 13, queens on board
		const aboveThresholdFen = "4k3/8/8/8/8/8/8/R2QK3 w - - 0 1";
		expect(getGamePhase(30, aboveThresholdFen)).toBe("middlegame");
	});

	it("returns 'endgame' when only one queen is off (both letters absent)", () => {
		// Only white queen, but queensOff checks for BOTH q and Q absent
		const oneQueenFen = "4k3/8/8/8/8/8/8/3QK3 w - - 0 1";
		// White Q present → queensOff returns false. Material = 9 ≤ 13? Yes, endgame
		expect(getGamePhase(30, oneQueenFen)).toBe("endgame");
	});
});

// ── getPiecesInvolved ──────────────────────────────────────────────────

describe("getPiecesInvolved", () => {
	const STARTING_FEN =
		"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

	it("identifies a pawn move", () => {
		const pieces = getPiecesInvolved("e4", "e2e4", STARTING_FEN);
		expect(pieces).toEqual(["pawn"]);
	});

	it("identifies a knight move", () => {
		const pieces = getPiecesInvolved("Nf3", "g1f3", STARTING_FEN);
		expect(pieces).toEqual(["knight"]);
	});

	it("identifies a bishop move", () => {
		const fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
		const pieces = getPiecesInvolved("Bc4", "f1c4", fen);
		expect(pieces).toEqual(["bishop"]);
	});

	it("identifies a rook move", () => {
		const fen = "4k3/8/8/8/8/8/8/R3K3 w - - 0 1";
		const pieces = getPiecesInvolved("Ra2", "a1a2", fen);
		expect(pieces).toEqual(["rook"]);
	});

	it("identifies a queen move", () => {
		const fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
		const pieces = getPiecesInvolved("Qh5", "d1h5", fen);
		expect(pieces).toEqual(["queen"]);
	});

	it("identifies a king move", () => {
		const fen = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
		const pieces = getPiecesInvolved("Ke2", "e1e2", fen);
		expect(pieces).toEqual(["king"]);
	});

	it("identifies kingside castling as king + rook", () => {
		const fen = "4k3/8/8/8/8/8/8/4K2R w K - 0 1";
		const pieces = getPiecesInvolved("O-O", "e1g1", fen);
		expect(pieces).toContain("king");
		expect(pieces).toContain("rook");
		expect(pieces).toHaveLength(2);
	});

	it("identifies queenside castling as king + rook", () => {
		const fen = "4k3/8/8/8/8/8/8/R3K3 w Q - 0 1";
		const pieces = getPiecesInvolved("O-O-O", "e1c1", fen);
		expect(pieces).toContain("king");
		expect(pieces).toContain("rook");
		expect(pieces).toHaveLength(2);
	});

	it("identifies a pawn capturing a piece", () => {
		// White pawn on d4, black pawn on e5
		const fen = "rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPP1PPPP/RNBQKBNR w KQkq e6 0 2";
		const pieces = getPiecesInvolved("dxe5", "d4e5", fen);
		expect(pieces).toContain("pawn");
		// Captured piece is also a pawn, so Set deduplicates
		expect(pieces).toHaveLength(1);
	});

	it("identifies a knight capturing a pawn", () => {
		// Knight on f3, pawn on e5
		const fen =
			"rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
		const pieces = getPiecesInvolved("Nxe5", "f3e5", fen);
		expect(pieces).toContain("knight");
		expect(pieces).toContain("pawn");
		expect(pieces).toHaveLength(2);
	});

	it("identifies a queen capturing a rook", () => {
		// Queen on d1, rook on d8
		const fen = "3rk3/8/8/8/8/8/8/3QK3 w - - 0 1";
		const pieces = getPiecesInvolved("Qxd8+", "d1d8", fen);
		expect(pieces).toContain("queen");
		expect(pieces).toContain("rook");
		expect(pieces).toHaveLength(2);
	});

	it("identifies en passant capture (pawn captures empty square)", () => {
		// White pawn on e5, black pawn just played d7-d5 (en passant target d6)
		const fen = "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3";
		const pieces = getPiecesInvolved("exd6", "e5d6", fen);
		// En passant: moving piece is pawn, captured piece is pawn (on d5, not d6)
		// Since d6 is empty in fenBefore, the code detects en passant
		expect(pieces).toContain("pawn");
		// Set deduplicates, so only one "pawn" entry
		expect(pieces).toHaveLength(1);
	});

	it("handles pawn promotion (non-capture)", () => {
		const fen = "8/P3k3/8/8/8/8/1K6/8 w - - 0 1";
		const pieces = getPiecesInvolved("a8=Q", "a7a8q", fen);
		// SAN starts with lowercase-ish a (no piece prefix) → pawn
		expect(pieces).toEqual(["pawn"]);
	});

	it("handles pawn promotion with capture", () => {
		// Pawn on a7, black rook on b8
		const fen = "1r2k3/P7/8/8/8/8/1K6/8 w - - 0 1";
		const pieces = getPiecesInvolved("axb8=Q", "a7b8q", fen);
		expect(pieces).toContain("pawn");
		expect(pieces).toContain("rook");
		expect(pieces).toHaveLength(2);
	});
});

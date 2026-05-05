import { describe, expect, test } from "vitest";
import { walkPgn } from "#/lib/analysis/pgn";
import { runGeneratorsForMove } from "#/lib/tagging/registry";
import type { Game, Move } from "#/lib/tagging/types";

// Italian Game opening — small enough for tests, exercises pawns + minor pieces.
const SAMPLE_PGN = `
[Event "Test"]
[Site "?"]
[Date "2024.01.01"]
[Round "1"]
[White "white"]
[Black "black"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. d3 d6 *
`;

function buildMoves(): { moves: Move[]; game: Game } {
	const pgn = walkPgn(SAMPLE_PGN);
	const game = mockGame();
	const moves: Move[] = pgn.map((m) => ({
		id: `move-${m.ply}`,
		analysisJobId: "job-1",
		gameId: game.id,
		playerId: game.playerId,
		ply: m.ply,
		color: m.isWhite ? "white" : "black",
		isPlayerMove: m.isWhite ? 1 : 0,
		san: m.san,
		uci: m.uci,
		fenBefore: m.fenBefore,
		fenAfter: m.fenAfter,
		engineBestUci: m.uci, // engine agrees with played move (no inaccuracy)
		engineBestSan: m.san,
		alternativeMoves: null,
		evalBeforeCp: 20,
		evalAfterCp: 20,
		evalDeltaCp: 0,
		accuracyScore: null,
		classification: "best",
		depthToStability: null,
		clockRemainingMs: null,
		createdAt: new Date(),
	}));
	return { moves, game };
}

function mockGame(): Game {
	return {
		id: "game-1",
		playerId: "player-1",
		platform: "chess.com",
		platformGameId: "x",
		pgn: SAMPLE_PGN,
		playedAt: new Date(),
		timeControl: "600",
		timeControlClass: "rapid",
		resultDetail: "agreed",
		playerColor: "white",
		playerRating: 1500,
		opponentUsername: "opp",
		opponentRating: 1500,
		openingEco: "C50",
		openingName: "Italian Game",
		accuracyWhite: null,
		accuracyBlack: null,
		fetchedAt: new Date(),
	};
}

describe("runGeneratorsForMove", () => {
	const { moves, game } = buildMoves();

	test("emits a phase tag for every move", () => {
		for (const move of moves) {
			const rows = runGeneratorsForMove({ move, game, allMoves: moves });
			const phaseTags = rows.filter((r) => r.dimensionType === "phase");
			expect(phaseTags).toHaveLength(1);
			expect(["opening", "middlegame", "endgame"]).toContain(
				phaseTags[0].dimensionValue,
			);
		}
	});

	test("opening moves are tagged as opening phase", () => {
		const earlyMove = moves[0]; // 1. e4
		const rows = runGeneratorsForMove({
			move: earlyMove,
			game,
			allMoves: moves,
		});
		const phase = rows.find((r) => r.dimensionType === "phase");
		expect(phase?.dimensionValue).toBe("opening");
	});

	test("piece tag matches the moved piece", () => {
		// 1. e4 = pawn
		const pawnMove = moves[0];
		const rows = runGeneratorsForMove({
			move: pawnMove,
			game,
			allMoves: moves,
		});
		const pieceTags = rows.filter((r) => r.dimensionType === "piece");
		expect(pieceTags.map((r) => r.dimensionValue)).toContain("pawn");

		// 3. Bc4 (move index 4) = bishop
		const bishopMove = moves[4];
		expect(bishopMove.san).toBe("Bc4");
		const bishopRows = runGeneratorsForMove({
			move: bishopMove,
			game,
			allMoves: moves,
		});
		const bishopPieces = bishopRows
			.filter((r) => r.dimensionType === "piece")
			.map((r) => r.dimensionValue);
		expect(bishopPieces).toContain("bishop");
	});

	test("castling produces both king and rook piece tags", () => {
		const castle = moves.find((m) => m.san === "O-O");
		expect(castle).toBeDefined();
		if (!castle) return;
		const rows = runGeneratorsForMove({
			move: castle,
			game,
			allMoves: moves,
		});
		const pieces = rows
			.filter((r) => r.dimensionType === "piece")
			.map((r) => r.dimensionValue)
			.sort();
		expect(pieces).toEqual(["king", "rook"]);
	});

	test("every tag carries source + sourceVersion + denormalized ids", () => {
		const rows = runGeneratorsForMove({
			move: moves[0],
			game,
			allMoves: moves,
		});
		for (const row of rows) {
			expect(row.source).toBe("heuristic");
			expect(row.sourceVersion).toMatch(/^(phase|piece|agency|concept)-v\d+$/);
			expect(row.moveId).toBe(moves[0].id);
			expect(row.playerId).toBe(game.playerId);
			expect(row.gameId).toBe(game.id);
			expect(row.confidence).toBe(1);
			expect(row.weight).toBe(1);
		}
	});
});

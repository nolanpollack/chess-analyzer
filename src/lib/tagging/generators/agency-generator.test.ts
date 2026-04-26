import { describe, expect, test } from "vitest";
import { agencyGenerator } from "#/lib/tagging/generators/agency-generator";
import type { Game, Move, MoveContext } from "#/lib/tagging/types";

function makeMove(overrides: Partial<Move>): Move {
	return {
		id: "m",
		analysisJobId: "job",
		gameId: "g",
		playerId: "p",
		ply: 1,
		color: "white",
		isPlayerMove: 1,
		san: "e4",
		uci: "e2e4",
		fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
		engineBestUci: "e2e4",
		engineBestSan: "e4",
		evalBeforeCp: 0,
		evalAfterCp: 20,
		evalDeltaCp: 20,
		accuracyScore: 100,
		classification: "best",
		depthToStability: null,
		clockRemainingMs: null,
		createdAt: new Date(),
		...overrides,
	};
}

const GAME: Game = {
	id: "g",
	playerId: "p",
	platform: "chess.com",
	platformGameId: "x",
	pgn: "",
	playedAt: new Date(),
	timeControl: "600",
	timeControlClass: "rapid",
	resultDetail: "agreed",
	playerColor: "white",
	playerRating: 1500,
	opponentUsername: "opp",
	opponentRating: 1500,
	openingEco: null,
	openingName: null,
	accuracyWhite: null,
	accuracyBlack: null,
	fetchedAt: new Date(),
};

function ctx(move: Move): MoveContext {
	return { move, game: GAME, allMoves: [move] };
}

describe("agencyGenerator", () => {
	test("classifies a quiet opening move as proactive", () => {
		const tags = agencyGenerator.generate(ctx(makeMove({})));
		expect(tags).toEqual([
			{ dimensionType: "agency", dimensionValue: "proactive" },
		]);
	});

	test("classifies a capture as forcing", () => {
		// 1. e4 e5 2. Nf3 Nc6 3. Nxe5 — white captures the e5 pawn
		const move = makeMove({
			ply: 5,
			san: "Nxe5",
			uci: "f3e5",
			fenBefore:
				"r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
			fenAfter:
				"r1bqkbnr/pppp1ppp/2n5/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3",
		});
		const [tag] = agencyGenerator.generate(ctx(move));
		expect(tag.dimensionValue).toBe("forcing");
	});

	test("classifies a check as forcing", () => {
		// Scholar's-mate-style position: white plays Qxf7+ → check (mate actually, both contain '+'/'#')
		const move = makeMove({
			ply: 7,
			san: "Qxf7#",
			uci: "h5f7",
			fenBefore:
				"r1bqkbnr/pppp1Qpp/2n5/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
			fenAfter:
				"r1bqkbnr/pppp1Qpp/2n5/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 5",
		});
		const [tag] = agencyGenerator.generate(ctx(move));
		expect(tag.dimensionValue).toBe("forcing");
	});

	test("classifies a piece responding to an attack as reactive", () => {
		// After 1. e4 e5 2. Nf3, black's e5 pawn is attacked. Black plays 2... Nc6 to defend.
		// Nc6 is not a capture/check, but the e5 pawn under attack means... wait, we need
		// the moved piece itself attacked. Use 2... d6 instead — same idea, e5 is attacked
		// but moving d6 doesn't move the attacked piece.
		// Better example: after 1. e4 d5 2. exd5, black's queen on d8 is fine but d5 pawn was
		// captured. Black plays 2... Qxd5 — capture (forcing, would dominate). Use a position
		// where the piece moving is attacked and the move is quiet.
		// Position: white knight on f3 attacking a black bishop on e5. Black moves Bd6.
		// Build via FEN directly.
		const move = makeMove({
			ply: 4,
			color: "black",
			isPlayerMove: 0,
			san: "Bd6",
			uci: "e5d6",
			// Black bishop on e5, white knight on f3 attacks it.
			fenBefore:
				"rnbqk1nr/pppp1ppp/8/4b3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 0 3",
			fenAfter:
				"rnbqk1nr/pppp1ppp/3b4/8/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 1 4",
		});
		const [tag] = agencyGenerator.generate(ctx(move));
		expect(tag.dimensionValue).toBe("reactive");
	});

	test("forcing wins over reactive when both apply", () => {
		// Black bishop on e5 attacked by white knight on f3. Black plays Bxf3 (capture).
		const move = makeMove({
			ply: 4,
			color: "black",
			isPlayerMove: 0,
			san: "Bxf3",
			uci: "e5f3",
			fenBefore:
				"rnbqk1nr/pppp1ppp/8/4b3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 0 3",
			fenAfter: "rnbqk1nr/pppp1ppp/8/8/4P3/5b2/PPPP1PPP/RNBQKB1R w KQkq - 0 4",
		});
		const [tag] = agencyGenerator.generate(ctx(move));
		expect(tag.dimensionValue).toBe("forcing");
	});
});

import { Chess } from "chess.js";
import type { MoveAnalysis } from "#/db/schema";
import { detectConcepts } from "#/lib/analysis/position";
import type { Move, ProposedTag, TagGenerator } from "#/lib/tagging/types";

export const conceptGenerator: TagGenerator = {
	name: "concept",
	version: "v1",
	sourceType: "heuristic",
	dimensionTypes: ["concept"],

	generate(ctx) {
		const moveData = toMoveAnalysis(ctx.move);
		const bestMoveFenAfter = computeBestMoveFenAfter(ctx.move);

		const concepts = detectConcepts(
			moveData,
			ctx.move.fenBefore,
			ctx.move.fenAfter,
			bestMoveFenAfter,
		);

		return concepts.map<ProposedTag>((concept) => ({
			dimensionType: "concept",
			dimensionValue: concept,
		}));
	},
};

function computeBestMoveFenAfter(move: Move): string {
	if (!move.engineBestUci) return move.fenAfter;
	try {
		const chess = new Chess(move.fenBefore);
		const uci = move.engineBestUci;
		chess.move({
			from: uci.slice(0, 2),
			to: uci.slice(2, 4),
			promotion: uci.slice(4, 5) || undefined,
		});
		return chess.fen();
	} catch {
		return move.fenAfter;
	}
}

function toMoveAnalysis(move: Move): MoveAnalysis {
	return {
		ply: move.ply,
		san: move.san,
		uci: move.uci,
		fen_before: move.fenBefore,
		fen_after: move.fenAfter,
		eval_before: move.evalBeforeCp ?? 0,
		eval_after: move.evalAfterCp ?? 0,
		eval_delta: move.evalDeltaCp ?? 0,
		best_move_uci: move.engineBestUci ?? "",
		best_move_san: move.engineBestSan ?? "",
		alternative_moves: move.alternativeMoves ?? null,
		classification: move.classification ?? "good",
		is_player_move: move.isPlayerMove === 1,
	};
}

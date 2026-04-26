import { getPiecesInvolved } from "#/lib/analysis/position";
import type { ProposedTag, TagGenerator } from "#/lib/tagging/types";

export const pieceGenerator: TagGenerator = {
	name: "piece",
	version: "v1",
	sourceType: "heuristic",
	dimensionTypes: ["piece"],

	generate(ctx) {
		const pieces = getPiecesInvolved(
			ctx.move.san,
			ctx.move.uci,
			ctx.move.fenBefore,
		);
		return pieces.map<ProposedTag>((piece) => ({
			dimensionType: "piece",
			dimensionValue: piece,
		}));
	},
};

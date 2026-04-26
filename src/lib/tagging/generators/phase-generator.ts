import { getGamePhase } from "#/lib/chess-analysis";
import type { TagGenerator } from "#/lib/tagging/types";

export const phaseGenerator: TagGenerator = {
	name: "phase",
	version: "v1",
	sourceType: "heuristic",
	dimensionTypes: ["phase"],

	generate(ctx) {
		const phase = getGamePhase(ctx.move.ply, ctx.move.fenAfter);
		return [{ dimensionType: "phase", dimensionValue: phase }];
	},
};

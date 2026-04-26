import type { moveTags } from "#/db/schema";
import { agencyGenerator } from "#/lib/tagging/generators/agency-generator";
import { conceptGenerator } from "#/lib/tagging/generators/concept-generator";
import { phaseGenerator } from "#/lib/tagging/generators/phase-generator";
import { pieceGenerator } from "#/lib/tagging/generators/piece-generator";
import type { MoveContext, TagGenerator } from "#/lib/tagging/types";
import { validateTagValue } from "#/lib/tagging/validate";

/**
 * The active list of tag generators. The worker iterates this list per move.
 * Add new generators here. Order is the dependency order (later generators
 * may read tags emitted by earlier ones once we add a tag-aware context).
 */
export const GENERATORS: readonly TagGenerator[] = [
	phaseGenerator,
	pieceGenerator,
	agencyGenerator,
	conceptGenerator,
];

type TagRow = typeof moveTags.$inferInsert;

/**
 * Run every registered generator against `ctx.move` and return rows ready
 * to insert into `move_tags`. Validates each tag against the taxonomy.
 */
export function runGeneratorsForMove(ctx: MoveContext): TagRow[] {
	const rows: TagRow[] = [];

	for (const gen of GENERATORS) {
		const proposed = gen.generate(ctx);
		for (const tag of proposed) {
			validateTagValue(tag.dimensionType, tag.dimensionValue, gen.name);
			rows.push({
				moveId: ctx.move.id,
				playerId: ctx.move.playerId,
				gameId: ctx.move.gameId,
				dimensionType: tag.dimensionType,
				dimensionValue: tag.dimensionValue,
				source: gen.sourceType,
				sourceVersion: `${gen.name}-${gen.version}`,
				confidence: tag.confidence ?? 1,
				weight: 1,
				weightFactors: null,
				metadata: tag.metadata ?? null,
			});
		}
	}

	return rows;
}

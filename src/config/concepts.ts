/**
 * Chess concept taxonomy — the fixed set of concepts the LLM can assign to moves.
 *
 * Each concept has an ID (matching the DB enum), a display name, a dimension
 * (category), and a brief description that is included in the LLM prompt.
 *
 * To add a new concept:
 * 1. Add the value to the `conceptEnum` in src/db/schema.ts
 * 2. Add the `Concept` type union in src/db/schema.ts
 * 3. Add the definition here
 * 4. Run `bun run db:generate` to create the migration
 * 5. Increment the prompt version in src/prompts/move-explanation.ts
 */

export type ConceptDimension =
	| "tactical"
	| "positional"
	| "strategic"
	| "endgame";

export type ConceptDefinition = {
	id: string;
	name: string;
	dimension: ConceptDimension;
	description: string;
};

export const CONCEPT_TAXONOMY: ConceptDefinition[] = [
	// Tactical
	{
		id: "hanging-piece",
		name: "Hanging piece",
		dimension: "tactical",
		description: "A piece left undefended and capturable",
	},
	{
		id: "fork",
		name: "Fork",
		dimension: "tactical",
		description: "One piece attacks two or more enemy pieces simultaneously",
	},
	{
		id: "pin",
		name: "Pin",
		dimension: "tactical",
		description:
			"A piece cannot move without exposing a more valuable piece behind it",
	},
	{
		id: "skewer",
		name: "Skewer",
		dimension: "tactical",
		description:
			"An attack on a valuable piece that, when moved, exposes a less valuable piece",
	},
	{
		id: "discovered-attack",
		name: "Discovered attack",
		dimension: "tactical",
		description: "Moving one piece reveals an attack by another piece",
	},
	{
		id: "back-rank",
		name: "Back rank weakness",
		dimension: "tactical",
		description: "King trapped on back rank with no escape squares",
	},
	{
		id: "overloaded-piece",
		name: "Overloaded piece",
		dimension: "tactical",
		description: "A piece tasked with defending too many things at once",
	},
	{
		id: "deflection",
		name: "Deflection",
		dimension: "tactical",
		description: "Forcing a defending piece away from its duty",
	},
	{
		id: "mating-pattern",
		name: "Mating pattern",
		dimension: "tactical",
		description: "A missed or executed checkmate pattern",
	},

	// Positional
	{
		id: "piece-activity",
		name: "Piece activity",
		dimension: "positional",
		description:
			"How actively placed your pieces are — centralized, controlling key squares",
	},
	{
		id: "pawn-structure",
		name: "Pawn structure",
		dimension: "positional",
		description:
			"Doubled, isolated, backward, or passed pawns affecting the position",
	},
	{
		id: "weak-square",
		name: "Weak square",
		dimension: "positional",
		description:
			"A square that cannot be defended by pawns and can be occupied by the opponent",
	},
	{
		id: "open-file",
		name: "Open file control",
		dimension: "positional",
		description: "Control of files with no pawns, especially for rooks",
	},
	{
		id: "bishop-pair",
		name: "Bishop pair",
		dimension: "positional",
		description: "Having both bishops vs opponent having only one or none",
	},
	{
		id: "outpost",
		name: "Outpost",
		dimension: "positional",
		description:
			"A square deep in enemy territory that cannot be attacked by pawns",
	},
	{
		id: "space-advantage",
		name: "Space advantage",
		dimension: "positional",
		description:
			"Controlling more of the board, limiting opponent piece mobility",
	},
	{
		id: "king-safety",
		name: "King safety",
		dimension: "positional",
		description:
			"How well-protected the king is — pawn shelter, open lines toward king",
	},

	// Strategic
	{
		id: "development",
		name: "Development",
		dimension: "strategic",
		description:
			"Getting pieces off the back rank and into active positions efficiently",
	},
	{
		id: "premature-attack",
		name: "Premature attack",
		dimension: "strategic",
		description:
			"Attacking before completing development or without sufficient preparation",
	},
	{
		id: "piece-coordination",
		name: "Piece coordination",
		dimension: "strategic",
		description: "Pieces working together to control squares or execute plans",
	},
	{
		id: "rook-activation",
		name: "Rook activation",
		dimension: "strategic",
		description: "Getting rooks onto open files or the seventh rank",
	},
	{
		id: "passed-pawn",
		name: "Passed pawn",
		dimension: "strategic",
		description:
			"A pawn with no opposing pawns blocking or guarding its advance",
	},
	{
		id: "prophylaxis",
		name: "Prophylaxis",
		dimension: "strategic",
		description: "Preventing opponent plans before they develop",
	},
	{
		id: "trade-evaluation",
		name: "Trade evaluation",
		dimension: "strategic",
		description: "Whether exchanging pieces helps or hurts your position",
	},

	// Endgame
	{
		id: "king-activation",
		name: "King activation",
		dimension: "endgame",
		description: "Using the king as an active piece in the endgame",
	},
	{
		id: "opposition",
		name: "Opposition",
		dimension: "endgame",
		description:
			"Kings facing each other with one square between — crucial in pawn endgames",
	},
	{
		id: "pawn-promotion",
		name: "Pawn promotion",
		dimension: "endgame",
		description:
			"Advancing a pawn to promote, or failing to prevent opponent promotion",
	},
	{
		id: "rook-endgame",
		name: "Rook endgame technique",
		dimension: "endgame",
		description:
			"Specific techniques like Lucena, Philidor, cutting off the king",
	},
];

// ── Helpers ────────────────────────────────────────────────────────────

const conceptsByDimension = new Map<ConceptDimension, ConceptDefinition[]>();
for (const concept of CONCEPT_TAXONOMY) {
	const list = conceptsByDimension.get(concept.dimension) ?? [];
	list.push(concept);
	conceptsByDimension.set(concept.dimension, list);
}

const conceptById = new Map<string, ConceptDefinition>();
for (const concept of CONCEPT_TAXONOMY) {
	conceptById.set(concept.id, concept);
}

/** Get all concepts belonging to a given dimension. */
export function getConceptsByDimension(
	dimension: ConceptDimension,
): ConceptDefinition[] {
	return conceptsByDimension.get(dimension) ?? [];
}

/** Get the dimension for a given concept ID. */
export function getDimensionForConcept(
	conceptId: string,
): ConceptDimension | null {
	return conceptById.get(conceptId)?.dimension ?? null;
}

/** Get a concept definition by ID. */
export function getConceptById(conceptId: string): ConceptDefinition | null {
	return conceptById.get(conceptId) ?? null;
}

/** Get all concept IDs as a flat array (for Zod enum validation). */
export function getAllConceptIds(): string[] {
	return CONCEPT_TAXONOMY.map((c) => c.id);
}

/** All dimension keys, in display order. */
export const CONCEPT_DIMENSIONS: ConceptDimension[] = [
	"tactical",
	"positional",
	"strategic",
	"endgame",
];

/** Human-readable label for each dimension. */
export const DIMENSION_LABELS: Record<ConceptDimension, string> = {
	tactical: "Tactical",
	positional: "Positional",
	strategic: "Strategic",
	endgame: "Endgame",
};

/**
 * Group an array of concept IDs by their dimension.
 * Returns only dimensions that have at least one concept.
 */
export function groupConceptsByDimension(
	conceptIds: string[],
): Map<ConceptDimension, ConceptDefinition[]> {
	const grouped = new Map<ConceptDimension, ConceptDefinition[]>();
	for (const id of conceptIds) {
		const concept = conceptById.get(id);
		if (!concept) continue;
		const list = grouped.get(concept.dimension) ?? [];
		list.push(concept);
		grouped.set(concept.dimension, list);
	}
	return grouped;
}

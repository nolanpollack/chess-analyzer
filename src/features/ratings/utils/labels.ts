import { CONCEPT_TAXONOMY } from "#/config/concepts";
import type { DimensionType } from "#/config/dimensions";

const PHASE_LABEL: Record<string, string> = {
	opening: "Opening",
	middlegame: "Middlegame",
	endgame: "Endgame",
};

const PIECE_LABEL: Record<string, string> = {
	pawn: "Pawn",
	knight: "Knight",
	bishop: "Bishop",
	rook: "Rook",
	queen: "Queen",
	king: "King",
};

const AGENCY_LABEL: Record<string, string> = {
	forcing: "Forcing",
	reactive: "Reactive",
	proactive: "Proactive",
};

const CONCEPT_LABEL: Record<string, string> = Object.fromEntries(
	CONCEPT_TAXONOMY.map((c) => [c.id, c.name]),
);

const PIECE_ORDER = ["pawn", "knight", "bishop", "rook", "queen", "king"];
const PHASE_ORDER = ["opening", "middlegame", "endgame"];
const AGENCY_ORDER = ["forcing", "reactive", "proactive"];

export function dimensionLabel(dim: DimensionType, value: string): string {
	switch (dim) {
		case "phase":
			return PHASE_LABEL[value] ?? value;
		case "piece":
			return PIECE_LABEL[value] ?? value;
		case "agency":
			return AGENCY_LABEL[value] ?? value;
		case "concept":
			return CONCEPT_LABEL[value] ?? value;
	}
}

/**
 * Stable sort key for displaying a dimension value within its group. Pieces
 * follow the conventional order (pawn → king); other dims are alphabetical
 * by id.
 */
export function dimensionSortKey(dim: DimensionType, value: string): number {
	if (dim === "piece") return PIECE_ORDER.indexOf(value);
	if (dim === "phase") return PHASE_ORDER.indexOf(value);
	if (dim === "agency") return AGENCY_ORDER.indexOf(value);
	return 0;
}

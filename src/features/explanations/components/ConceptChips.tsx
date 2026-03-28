/**
 * Renders concept tags grouped by dimension, plus deterministic tags (phase, pieces).
 */
import { Badge } from "#/components/ui/badge";
import {
	CONCEPT_DIMENSIONS,
	DIMENSION_LABELS,
	groupConceptsByDimension,
} from "#/config/concepts";
import type { ChessPiece, GamePhase } from "#/db/schema";

type ConceptChipsProps = {
	/** LLM-assigned concept IDs (may be null if not yet explained). */
	concepts: string[] | null;
	/** Deterministic game phase tag. */
	gamePhase: GamePhase;
	/** Deterministic pieces involved. */
	piecesInvolved: ChessPiece[];
};

const PHASE_LABELS: Record<GamePhase, string> = {
	opening: "Opening",
	middlegame: "Middlegame",
	endgame: "Endgame",
};

const PIECE_LABELS: Record<ChessPiece, string> = {
	pawn: "Pawn",
	knight: "Knight",
	bishop: "Bishop",
	rook: "Rook",
	queen: "Queen",
	king: "King",
};

export function ConceptChips({
	concepts,
	gamePhase,
	piecesInvolved,
}: ConceptChipsProps) {
	const grouped = concepts ? groupConceptsByDimension(concepts) : null;

	return (
		<div className="flex flex-col gap-2">
			{/* LLM-assigned concept chips grouped by dimension */}
			{grouped &&
				CONCEPT_DIMENSIONS.map((dimension) => {
					const dimensionConcepts = grouped.get(dimension);
					if (!dimensionConcepts || dimensionConcepts.length === 0) return null;
					return (
						<div
							key={dimension}
							className="flex flex-wrap items-center gap-1.5"
						>
							<span className="text-xs text-muted-foreground">
								{DIMENSION_LABELS[dimension]}:
							</span>
							{dimensionConcepts.map((concept) => (
								<Badge
									key={concept.id}
									variant="secondary"
									className="bg-primary/10 text-primary border-primary/20 text-xs"
								>
									{concept.name}
								</Badge>
							))}
						</div>
					);
				})}

			{/* Deterministic tags — muted styling */}
			<div className="flex flex-wrap items-center gap-1.5">
				<Badge
					variant="secondary"
					className="bg-muted text-muted-foreground border-border text-xs"
				>
					{PHASE_LABELS[gamePhase]}
				</Badge>
				{piecesInvolved.map((piece) => (
					<Badge
						key={piece}
						variant="secondary"
						className="bg-muted text-muted-foreground border-border text-xs"
					>
						{PIECE_LABELS[piece]}
					</Badge>
				))}
			</div>
		</div>
	);
}

/**
 * Panel that displays a move explanation with all states:
 * - No explanation yet → show Explain button
 * - Loading → show spinner
 * - Explanation loaded → show text, principle, concept chips
 * - Error → show error with retry
 */

import type { MoveAnalysis } from "#/db/schema";
import { ConceptChips } from "#/features/explanations/components/ConceptChips";
import { ExplainButton } from "#/features/explanations/components/ExplainButton";
import { useExplanation } from "#/features/explanations/hooks/use-explanation";
import { useGenerateExplanation } from "#/features/explanations/hooks/use-generate-explanation";

type ExplanationPanelProps = {
	gameAnalysisId: string;
	move: MoveAnalysis;
};

export function ExplanationPanel({
	gameAnalysisId,
	move,
}: ExplanationPanelProps) {
	const { data: explanationData } = useExplanation(gameAnalysisId, move.ply);
	const generate = useGenerateExplanation(gameAnalysisId);

	const explanation = explanationData?.explanation ?? null;
	const tags = explanationData?.tags ?? null;

	const handleExplain = () => {
		generate.mutate(move.ply);
	};

	return (
		<div className="mt-3 flex flex-col gap-3">
			{/* State: error */}
			{generate.isError && !explanation && (
				<div className="flex flex-col gap-2">
					<p className="text-sm text-destructive">
						Something went wrong. Try again.
					</p>
					<ExplainButton
						classification={move.classification}
						isLoading={false}
						onClick={handleExplain}
					/>
				</div>
			)}

			{/* State: no explanation yet — show button */}
			{!explanation && !generate.isPending && !generate.isError && (
				<ExplainButton
					classification={move.classification}
					isLoading={false}
					onClick={handleExplain}
				/>
			)}

			{/* State: loading */}
			{!explanation && generate.isPending && (
				<ExplainButton
					classification={move.classification}
					isLoading={true}
					onClick={handleExplain}
				/>
			)}

			{/* State: explanation loaded */}
			{explanation && (
				<div className="flex flex-col gap-3">
					<p className="text-sm leading-relaxed">{explanation.explanation}</p>

					{explanation.principle && (
						<p className="text-sm text-muted-foreground italic">
							{explanation.principle}
						</p>
					)}

					{tags && (
						<ConceptChips
							concepts={tags.concepts}
							gamePhase={tags.gamePhase}
							piecesInvolved={tags.piecesInvolved}
						/>
					)}
				</div>
			)}
		</div>
	);
}

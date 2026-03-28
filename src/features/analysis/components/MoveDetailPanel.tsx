import { Badge } from "#/components/ui/badge";
import { ANALYSIS_CONFIG } from "#/config/analysis";
import type { MoveAnalysis } from "#/db/schema";
import {
	formatEvalDisplay,
	getClassificationStyle,
} from "#/features/analysis/utils";
import { ExplanationPanel } from "#/features/explanations/components/ExplanationPanel";

type MoveDetailPanelProps = {
	move: MoveAnalysis | null;
	gameAnalysisId: string;
};

export function MoveDetailPanel({
	move,
	gameAnalysisId,
}: MoveDetailPanelProps) {
	const clamp = ANALYSIS_CONFIG.evalClamp;

	// Always render a fixed-height card to prevent layout shifts in the parent
	if (!move) {
		return <div className="shrink-0 rounded-lg border bg-card p-4 h-[88px]" />;
	}

	const style = getClassificationStyle(move.classification);

	const isGoodOrBetter =
		move.classification === "good" ||
		move.classification === "best" ||
		move.classification === "brilliant";

	let subText: string | null = null;
	if (!isGoodOrBetter) {
		subText = `Best: ${move.best_move_san} (${formatEvalDisplay(move.eval_before, clamp)})`;
	} else if (move.classification === "best") {
		subText = "Matches engine recommendation.";
	} else if (move.classification === "brilliant") {
		subText = "Found a move even the engine didn't initially prefer.";
	}

	return (
		<div className="shrink-0 rounded-lg border bg-card p-4">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="text-lg font-semibold">{move.san}</span>
					<Badge variant="secondary" className={`${style.bg} ${style.text}`}>
						{style.label}
					</Badge>
				</div>
				<div className="text-right">
					<p className="text-lg font-semibold tabular-nums">
						{formatEvalDisplay(move.eval_after, clamp)}
					</p>
					{move.eval_delta !== 0 && (
						<span
							className={`text-xs tabular-nums ${move.eval_delta > 0 ? "text-win" : "text-loss"}`}
						>
							{formatEvalDisplay(move.eval_delta)}
						</span>
					)}
				</div>
			</div>
			{/* Always reserve one line so height stays stable as moves change */}
			<p className="mt-3 min-h-[1lh] text-sm text-muted-foreground">
				{subText &&
					(!isGoodOrBetter ? (
						<>
							Best:{" "}
							<span className="font-medium text-foreground">
								{move.best_move_san}
							</span>{" "}
							<span className="tabular-nums">
								({formatEvalDisplay(move.eval_before, clamp)})
							</span>
						</>
					) : (
						subText
					))}
			</p>

			{/* Explanation panel — handles all states (empty, loading, loaded, error) */}
			<ExplanationPanel gameAnalysisId={gameAnalysisId} move={move} />
		</div>
	);
}

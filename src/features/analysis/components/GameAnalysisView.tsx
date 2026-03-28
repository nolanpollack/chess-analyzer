import { Button } from "#/components/ui/button";
import { BoardControls } from "#/features/analysis/components/BoardControls";
import { EvalGraph } from "#/features/analysis/components/EvalGraph";
import { GameBoard } from "#/features/analysis/components/GameBoard";
import { GamePerformanceSummary } from "#/features/analysis/components/GamePerformanceSummary";
import { MoveDetailPanel } from "#/features/analysis/components/MoveDetailPanel";
import { MoveList } from "#/features/analysis/components/MoveList";
import { useMoveNavigation } from "#/features/analysis/hooks/use-move-navigation";
import { useReanalyze } from "#/features/analysis/hooks/use-reanalyze";
import type { AnalysisData } from "#/features/analysis/types";

type GameAnalysisViewProps = {
	gameId: string;
	gameAnalysisId: string;
	moves: AnalysisData["moves"];
	playerColor: "white" | "black";
	accuracyWhite: number | null;
	accuracyBlack: number | null;
};

export function GameAnalysisView({
	gameId,
	gameAnalysisId,
	moves,
	playerColor,
	accuracyWhite,
	accuracyBlack,
}: GameAnalysisViewProps) {
	const reanalyze = useReanalyze(gameId);
	const navigation = useMoveNavigation({ moves, enableKeyboard: true });

	const playerAccuracy =
		playerColor === "white" ? accuracyWhite : accuracyBlack;

	return (
		<>
			<div className="flex items-center gap-4">
				{playerAccuracy !== null && (
					<p className="text-sm text-muted-foreground">
						Accuracy: <span className="font-medium">{playerAccuracy}%</span>
					</p>
				)}
				<Button
					variant="outline"
					size="sm"
					className="ml-auto text-xs"
					onClick={() => reanalyze.mutate()}
					disabled={reanalyze.isPending}
				>
					{reanalyze.isPending ? "Re-analyzing..." : "Re-analyze"}
				</Button>
			</div>

			{/* On mobile: single column, board on top. On desktop: side-by-side, fills remaining height. */}
			<div className="grid grid-cols-1 gap-6 md:grid-cols-[4fr_3fr] md:flex-1 md:min-h-0">
				{/* Left column: board + controls */}
				<div className="flex flex-col gap-3">
					<GameBoard
						fen={navigation.currentFen}
						boardOrientation={playerColor}
						currentMove={navigation.currentMove}
					/>
					<BoardControls
						onFirst={navigation.goToFirst}
						onPrev={navigation.goToPrev}
						onNext={navigation.goToNext}
						onLast={navigation.goToLast}
						canGoPrev={navigation.currentPly > 0}
						canGoNext={navigation.currentPly < moves.length}
					/>
				</div>

				{/* Right column: eval graph + move list + move detail */}
				<div className="flex flex-col gap-4 md:min-h-0">
					<EvalGraph
						moves={moves}
						currentPly={navigation.currentPly}
						onClickMove={navigation.goToPly}
						playerIsWhite={playerColor === "white"}
					/>
					<MoveList
						moves={moves}
						currentPly={navigation.currentPly}
						onSelectMove={navigation.goToPly}
					/>
					<MoveDetailPanel
						move={navigation.currentMove}
						gameAnalysisId={gameAnalysisId}
					/>
					<GamePerformanceSummary gameAnalysisId={gameAnalysisId} />
				</div>
			</div>
		</>
	);
}

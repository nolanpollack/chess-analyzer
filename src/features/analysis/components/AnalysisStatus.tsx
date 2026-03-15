import { Loader2 } from "lucide-react";
import { Button } from "#/components/ui/button";
import { useTriggerAnalysis } from "#/features/analysis/hooks/use-trigger-analysis";

type AnalysisStatusProps = {
	status: "pending" | "complete" | "failed" | null;
	movesAnalyzed: number;
	totalMoves: number | null;
	error?: string;
	gameId: string;
	onRetry?: () => void;
};

export function AnalysisStatus({
	status,
	movesAnalyzed,
	totalMoves,
	error,
	gameId,
	onRetry,
}: AnalysisStatusProps) {
	const triggerMutation = useTriggerAnalysis(gameId, onRetry);

	// Show spinner immediately while triggering (optimistic), or while pending
	if (triggerMutation.isPending || status === "pending") {
		const progress =
			totalMoves && totalMoves > 0
				? Math.round((movesAnalyzed / totalMoves) * 100)
				: null;

		return (
			<div className="flex flex-col items-center gap-3 py-8">
				<Loader2 className="size-5 animate-spin text-muted-foreground" />
				<p className="text-sm text-muted-foreground">
					{triggerMutation.isPending || progress === null
						? "Starting analysis..."
						: `Analyzing move ${movesAnalyzed} of ${totalMoves}...`}
				</p>
				{progress !== null && !triggerMutation.isPending && (
					<div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-primary transition-all duration-300"
							style={{ width: `${progress}%` }}
						/>
					</div>
				)}
			</div>
		);
	}

	if (status === "failed") {
		return (
			<div className="flex flex-col items-center gap-3 py-8">
				<p className="text-sm text-destructive">
					Analysis failed{error ? `: ${error}` : "."}
				</p>
				<Button
					variant="outline"
					size="sm"
					onClick={() => triggerMutation.mutate()}
				>
					Retry Analysis
				</Button>
			</div>
		);
	}

	if (status === null) {
		return (
			<div className="flex flex-col items-center gap-3 py-8">
				<p className="text-sm text-muted-foreground">
					This game has not been analyzed yet.
				</p>
				<Button
					variant="outline"
					size="sm"
					onClick={() => triggerMutation.mutate()}
				>
					Analyze Game
				</Button>
			</div>
		);
	}

	return null;
}

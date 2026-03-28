import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { PhaseBreakdown } from "#/features/analysis/components/PhaseBreakdown";
import { PieceBreakdown } from "#/features/analysis/components/PieceBreakdown";
import { useGamePerformance } from "#/features/profile/hooks/use-game-performance";

type Props = {
	gameAnalysisId: string;
};

export function GamePerformanceSummary({ gameAnalysisId }: Props) {
	const { data, isLoading } = useGamePerformance(gameAnalysisId);
	const [expanded, setExpanded] = useState(false);

	if (isLoading) return <PerformanceSkeleton />;
	if (!data || "error" in data || !data.performance) return null;

	const perf = data.performance;

	return (
		<Card className="gap-0 py-0">
			<button
				type="button"
				className="flex w-full items-center justify-between px-6 py-4"
				onClick={() => setExpanded(!expanded)}
			>
				<span className="text-[15px] font-medium">Game Performance</span>
				<span className="text-xs text-muted-foreground">
					{expanded ? "collapse" : "expand"}
				</span>
			</button>

			{expanded && (
				<CardContent className="border-t border-border/50 pb-5 pt-3">
					<PhaseBreakdown perf={perf} />
					<PieceBreakdown
						pieceStats={perf.pieceStats}
						overallAccuracy={perf.overallAccuracy}
					/>
				</CardContent>
			)}
		</Card>
	);
}

function PerformanceSkeleton() {
	return (
		<Card className="animate-pulse gap-0 py-4">
			<CardHeader>
				<CardTitle className="h-4 w-32 rounded bg-muted" />
			</CardHeader>
		</Card>
	);
}

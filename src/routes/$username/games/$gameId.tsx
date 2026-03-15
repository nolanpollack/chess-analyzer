import { createFileRoute, Link } from "@tanstack/react-router";
import { GameAnalysisView } from "#/features/analysis/components/GameAnalysisView";
import { GameDetailHeader } from "#/features/analysis/components/GameDetailHeader";
import { GameDetailSkeleton } from "#/features/analysis/components/GameDetailSkeleton";
import { GamePendingView } from "#/features/analysis/components/GamePendingView";
import { useAnalysisLifecycle } from "#/features/analysis/hooks/use-analysis-lifecycle";
import { useAnalysisStatus } from "#/features/analysis/hooks/use-analysis-status";
import { useGameAnalysis } from "#/features/analysis/hooks/use-game-analysis";

export const Route = createFileRoute("/$username/games/$gameId")({
	component: GameDetailPage,
});

function GameDetailPage() {
	const { username, gameId } = Route.useParams();
	const { data, isLoading } = useGameAnalysis(gameId);
	const analysisStatus = useAnalysisStatus(
		gameId,
		!data?.analysis || data.analysis.status !== "complete",
	);

	const polledStatus =
		analysisStatus.data?.status ?? data?.analysis?.status ?? null;
	useAnalysisLifecycle(gameId, polledStatus, data?.analysis?.status ?? null);

	if (isLoading) {
		return <GameDetailSkeleton />;
	}

	if (!data?.game) {
		return (
			<div className="py-12 text-center">
				<p className="text-sm font-medium">Game not found</p>
				<p className="mt-1 text-sm text-muted-foreground">
					This game does not exist or has been removed.
				</p>
				<Link
					to="/$username"
					params={{ username }}
					className="mt-4 inline-block text-sm text-primary hover:underline"
				>
					Back to games
				</Link>
			</div>
		);
	}

	const { game, analysis } = data;
	const analysisComplete = analysis?.status === "complete";
	const moves = analysis?.moves ?? [];

	return (
		<div className="flex flex-col gap-6 md:h-full md:min-h-0">
			<GameDetailHeader game={game} username={username} />

			{analysisComplete ? (
				<GameAnalysisView
					gameId={gameId}
					moves={moves}
					playerColor={game.playerColor as "white" | "black"}
					accuracyWhite={analysis?.accuracyWhite ?? null}
					accuracyBlack={analysis?.accuracyBlack ?? null}
				/>
			) : (
				<GamePendingView
					game={game}
					gameId={gameId}
					status={analysisStatus.data?.status ?? analysis?.status ?? null}
					movesAnalyzed={
						analysisStatus.data?.movesAnalyzed ?? analysis?.movesAnalyzed ?? 0
					}
					totalMoves={
						analysisStatus.data?.totalMoves ?? analysis?.totalMoves ?? null
					}
					error={
						analysisStatus.data?.error ?? analysis?.errorMessage ?? undefined
					}
					onRetry={() => analysisStatus.refetch()}
				/>
			)}
		</div>
	);
}

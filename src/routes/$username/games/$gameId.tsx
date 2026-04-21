import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageContainer } from "#/components/layout/PageContainer";
import { Topbar } from "#/components/layout/Topbar";
import { ExplanationCard } from "#/features/explanations/components/ExplanationCard";
import { AnalysisStatusOverlay } from "#/features/game/components/AnalysisStatusOverlay";
import { BoardPanel } from "#/features/game/components/BoardPanel";
import { EvalBar } from "#/features/game/components/EvalBar";
import { EvalGraphCard } from "#/features/game/components/EvalGraphCard";
import { FactorBreakdownCard } from "#/features/game/components/FactorBreakdownCard";
import { GamePageHeader } from "#/features/game/components/GamePageHeader";
import { MoveListCard } from "#/features/game/components/MoveListCard";
import { useGameDetail } from "#/features/game/hooks/use-game-detail";
import { useGamePerformance } from "#/features/game/hooks/use-game-performance";
import { useMoveNavigation } from "#/features/game/hooks/use-move-navigation";
import { findCriticalMoveIndex } from "#/features/game/utils/critical-move";
import { buildFactorBreakdown } from "#/features/game/utils/factor-breakdown";
import { flattenMoves } from "#/features/game/utils/flat-moves";
import { accuracyToElo } from "#/lib/elo-estimate";

export const Route = createFileRoute("/$username/games/$gameId")({
	component: GameDetailPage,
});

function GameDetailPage() {
	const { username, gameId } = Route.useParams();
	const navigate = useNavigate();
	const { data, isLoading } = useGameDetail(gameId);

	const game = data?.game ?? null;
	const analysis = data?.analysis ?? null;
	const analysisComplete = analysis?.status === "complete";

	const moves = useMemo(
		() => (analysisComplete ? flattenMoves(analysis.moves) : []),
		[analysisComplete, analysis],
	);
	const criticalIndex = useMemo(
		() => (moves.length ? findCriticalMoveIndex(moves) : -1),
		[moves],
	);
	const initialCursor = criticalIndex >= 0 ? criticalIndex : 0;

	return (
		<>
			<Topbar
				crumbs={[
					{
						label: username,
						onClick: () => navigate({ to: "/$username", params: { username } }),
					},
					{ label: "Game" },
				]}
			/>
			<PageContainer>
				{isLoading ? (
					<div className="py-8 text-center text-[13px] text-fg-3">Loading…</div>
				) : !game ? (
					<div className="py-8 text-center text-[13px] text-fg-3">
						Game not found.
					</div>
				) : !analysisComplete ? (
					<AnalysisStatusOverlay
						gameId={gameId}
						status={analysis?.status ?? null}
						errorMessage={analysis?.errorMessage ?? null}
					/>
				) : (
					<GameDetailBody
						username={username}
						gameId={gameId}
						game={game}
						analysisId={analysis.id}
						moves={moves}
						criticalIndex={criticalIndex}
						initialCursor={initialCursor}
					/>
				)}
			</PageContainer>
		</>
	);
}

type GameDetailBodyProps = {
	username: string;
	gameId: string;
	game: NonNullable<
		Extract<ReturnType<typeof useGameDetail>["data"], { game: unknown }>["game"]
	>;
	analysisId: string;
	moves: ReturnType<typeof flattenMoves>;
	criticalIndex: number;
	initialCursor: number;
};

function GameDetailBody({
	username,
	gameId: _gameId,
	game,
	analysisId,
	moves,
	criticalIndex,
	initialCursor,
}: GameDetailBodyProps) {
	const { cursor, setCursor, flipped, prev, next, first, last, toggleFlip } =
		useMoveNavigation(moves.length, initialCursor);

	const cur = moves[cursor];
	const { data: performance } = useGamePerformance(analysisId);

	const overallElo =
		performance?.overallAccuracy != null
			? accuracyToElo(performance.overallAccuracy)
			: null;
	const accuracy = performance?.overallAccuracy ?? null;
	const gameScore = overallElo;

	const factors = performance ? buildFactorBreakdown(performance) : [];

	return (
		<>
			<GamePageHeader
				game={{
					playerUsername: username,
					opponentUsername: game.opponentUsername,
					opponentRating: game.opponentRating,
					playerColor: game.playerColor,
					resultDetail: game.resultDetail,
					openingName: game.openingName,
					openingEco: game.openingEco,
					timeControl: game.timeControl,
				}}
				moveCount={moves.length}
				gameScore={gameScore}
				overallElo={overallElo}
				accuracy={accuracy}
			/>

			<div className="mb-4 grid grid-cols-[56px_minmax(0,1fr)_minmax(0,360px)] gap-4">
				<EvalBar evalCp={cur?.eval_after ?? 0} flipped={flipped} />
				<div>
					<BoardPanel
						moves={moves}
						cursor={cursor}
						flipped={flipped}
						onPrev={prev}
						onNext={next}
						onFirst={first}
						onLast={last}
						onFlip={toggleFlip}
					/>
					<EvalGraphCard
						moves={moves}
						cursor={cursor}
						criticalIndex={criticalIndex}
						onScrub={setCursor}
					/>
				</div>
				<div className="flex flex-col gap-4">
					{cur && <ExplanationCard move={cur} gameAnalysisId={analysisId} />}
					<MoveListCard moves={moves} cursor={cursor} onSelect={setCursor} />
				</div>
			</div>

			{overallElo !== null && factors.length > 0 && (
				<FactorBreakdownCard factors={factors} overallElo={overallElo} />
			)}
		</>
	);
}

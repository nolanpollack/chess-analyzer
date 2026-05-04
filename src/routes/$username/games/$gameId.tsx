import { useQueries } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageContainer } from "#/components/layout/PageContainer";
import { Topbar } from "#/components/layout/Topbar";
import { AnalysisStatusOverlay } from "#/features/game/components/AnalysisStatusOverlay";
import { BoardPanel } from "#/features/game/components/BoardPanel";
import { EvalBar } from "#/features/game/components/EvalBar";
import { EvalGraphCard } from "#/features/game/components/EvalGraphCard";
import { FactorBreakdownCard } from "#/features/game/components/FactorBreakdownCard";
import { GamePageHeader } from "#/features/game/components/GamePageHeader";
import { UnifiedAnalysisCard } from "#/features/game/components/UnifiedAnalysisCard";
import { useGameDetail } from "#/features/game/hooks/use-game-detail";
import { useMoveNavigation } from "#/features/game/hooks/use-move-navigation";
import type { GameFactor } from "#/features/game/types";
import { flattenMoves } from "#/features/game/utils/flat-moves";
import { usePlayerSummary } from "#/features/profile/hooks/use-player-summary";
import { useMaiaGameRating } from "#/features/ratings/hooks/use-maia-game-rating";
import { getMaiaTagRatings } from "#/features/ratings/server/maia-queries";
import { maiaTagRatingsToGameFactors } from "#/features/ratings/utils/to-maia-game-factor";

export const Route = createFileRoute("/$username/games/$gameId")({
	component: GameDetailPage,
});

function GameDetailPage() {
	const { username, gameId } = Route.useParams();
	const { data, isLoading } = useGameDetail(gameId);

	const game = data?.game ?? null;
	const analysis = data?.analysis ?? null;
	const analysisComplete = analysis?.status === "complete";

	const moves = useMemo(
		() =>
			analysisComplete
				? flattenMoves(analysis.moves, game?.timeControl ?? null)
				: [],
		[analysisComplete, analysis, game?.timeControl],
	);
	// Start at the last move so the user sees the completed game state
	const initialCursor = Math.max(0, moves.length - 1);

	return (
		<>
			<Topbar
				crumbs={[
					{ label: "Profile", to: { to: "/$username", params: { username } } },
					{
						label: "Games",
						to: { to: "/$username/games", params: { username } },
					},
					{ label: game ? `vs ${game.opponentUsername}` : "Game" },
				]}
			/>
			<PageContainer>
				{isLoading ? (
					<div className="py-8 text-center text-ui text-fg-3">Loading…</div>
				) : !game ? (
					<div className="py-8 text-center text-ui text-fg-3">
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
						initialCursor={initialCursor}
						accuracy={
							game.playerColor === "white"
								? analysis.accuracyWhite
								: analysis.accuracyBlack
						}
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
	initialCursor: number;
	accuracy: number | null;
};

const GAME_DIMENSION_TYPES = ["phase", "piece", "agency"] as const;
type GameDimensionType = (typeof GAME_DIMENSION_TYPES)[number];

function GameDetailBody({
	username,
	gameId,
	game,
	analysisId,
	moves,
	initialCursor,
	accuracy,
}: GameDetailBodyProps) {
	const playerColor = game.playerColor;
	const { cursor, setCursor, flipped, prev, next, first, last, toggleFlip } =
		useMoveNavigation(moves.length, initialCursor, playerColor === "black");

	const cur = moves[cursor];

	// Headline Maia rating for this game
	const { data: maiaRating } = useMaiaGameRating(analysisId);
	const sideMaia =
		playerColor === "white" ? maiaRating?.white : maiaRating?.black;
	const gameRating = sideMaia ? Math.round(sideMaia.predicted) : null;

	// Player's overall historical rating for comparison
	const { data: playerSummary } = usePlayerSummary(username);
	const overallElo = playerSummary?.playerRating ?? null;

	// Per-dimension Maia tag ratings — one query per dimension, scoped to this game
	const dimensionQueries = useQueries({
		queries: GAME_DIMENSION_TYPES.map((dimensionType) => ({
			queryKey: [
				"maiaTagRatings",
				game.playerId,
				dimensionType,
				null,
				"trailing_20",
				gameId,
			] as const,
			queryFn: async () => {
				const result = await getMaiaTagRatings({
					data: {
						playerId: game.playerId,
						dimensionType,
						windowKey: "trailing_20",
						gameId,
					},
				});
				if ("error" in result) throw new Error(result.error);
				return maiaTagRatingsToGameFactors(
					dimensionType as GameDimensionType,
					result.ratings,
					overallElo ?? 1500,
				);
			},
			enabled: !!game.playerId && !!gameId,
		})),
	});

	const factors: GameFactor[] = dimensionQueries.flatMap((q) => q.data ?? []);

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
				gameRating={gameRating}
				overallElo={overallElo}
				accuracy={accuracy}
			/>

			<div
				className="mb-4 grid gap-4"
				style={{ gridTemplateColumns: "56px minmax(0,1fr) minmax(0,360px)" }}
			>
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
					<EvalGraphCard moves={moves} cursor={cursor} onScrub={setCursor} />
				</div>
				<div className="flex flex-col gap-4">
					{cur && (
						<UnifiedAnalysisCard
							move={cur}
							moves={moves}
							cursor={cursor}
							onSelect={setCursor}
							gameAnalysisId={analysisId}
						/>
					)}
				</div>
			</div>

			{overallElo !== null && factors.length > 0 && (
				<FactorBreakdownCard factors={factors} overallElo={overallElo} />
			)}
		</>
	);
}

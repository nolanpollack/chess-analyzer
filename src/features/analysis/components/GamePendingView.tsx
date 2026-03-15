import { AnalysisStatus } from "#/features/analysis/components/AnalysisStatus";
import { GameBoard } from "#/features/analysis/components/GameBoard";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type GamePendingViewProps = {
	game: {
		playerColor: string;
		pgn: string;
	};
	gameId: string;
	status: "pending" | "complete" | "failed" | null;
	movesAnalyzed: number;
	totalMoves: number | null;
	error?: string;
	onRetry: () => void;
};

export function GamePendingView({
	game,
	gameId,
	status,
	movesAnalyzed,
	totalMoves,
	error,
	onRetry,
}: GamePendingViewProps) {
	return (
		<div className="grid grid-cols-1 gap-6 md:grid-cols-[3fr_4fr]">
			<div className="flex flex-col gap-3">
				<GameBoard
					fen={START_FEN}
					boardOrientation={game.playerColor as "white" | "black"}
					currentMove={null}
				/>
			</div>
			<div className="flex items-center justify-center">
				<AnalysisStatus
					status={status}
					movesAnalyzed={movesAnalyzed}
					totalMoves={totalMoves}
					error={error}
					gameId={gameId}
					onRetry={onRetry}
				/>
			</div>
		</div>
	);
}

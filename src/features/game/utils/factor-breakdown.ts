import type { ChessPiece } from "#/db/schema";
import type { GameFactor } from "#/features/game/types";
import { accuracyToElo } from "#/lib/elo-estimate";

// Local view-model type. Phase 3 will replace this entirely with output
// from the scoring engine (one rating per dimension value).
type PieceStats = Record<
	ChessPiece,
	{ accuracy: number; avgCpLoss: number; moveCount: number }
>;

type Performance = {
	overallAccuracy: number;
	openingAccuracy: number | null;
	openingMoveCount: number;
	middlegameAccuracy: number | null;
	middlegameMoveCount: number;
	endgameAccuracy: number | null;
	endgameMoveCount: number;
	pieceStats: PieceStats;
};

const PIECE_LABEL: Record<ChessPiece, string> = {
	pawn: "Pawn",
	knight: "Knight",
	bishop: "Bishop",
	rook: "Rook",
	queen: "Queen",
	king: "King",
};

const PIECE_ORDER: ChessPiece[] = [
	"pawn",
	"knight",
	"bishop",
	"rook",
	"queen",
	"king",
];

export function buildFactorBreakdown(perf: Performance): GameFactor[] {
	const overallElo = accuracyToElo(perf.overallAccuracy);
	const factors: GameFactor[] = [];

	const phases: { label: string; accuracy: number | null; count: number }[] = [
		{
			label: "Opening",
			accuracy: perf.openingAccuracy,
			count: perf.openingMoveCount,
		},
		{
			label: "Middlegame",
			accuracy: perf.middlegameAccuracy,
			count: perf.middlegameMoveCount,
		},
		{
			label: "Endgame",
			accuracy: perf.endgameAccuracy,
			count: perf.endgameMoveCount,
		},
	];

	for (const p of phases) {
		if (p.count === 0 || p.accuracy === null) continue;
		const value = accuracyToElo(p.accuracy);
		factors.push({
			label: p.label,
			group: "phase",
			value,
			delta: value - overallElo,
			moveCount: p.count,
		});
	}

	for (const piece of PIECE_ORDER) {
		const stat = perf.pieceStats[piece];
		if (!stat || stat.moveCount === 0) continue;
		const value = accuracyToElo(stat.accuracy);
		factors.push({
			label: PIECE_LABEL[piece],
			group: "piece",
			value,
			delta: value - overallElo,
			moveCount: stat.moveCount,
		});
	}

	return factors;
}

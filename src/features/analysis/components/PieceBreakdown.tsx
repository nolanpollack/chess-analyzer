import { AccuracyBar } from "#/components/AccuracyBar";
import { Badge } from "#/components/ui/badge";
import type { ChessPiece, PieceStats } from "#/db/schema";

const MIN_MOVES_FOR_WEAKEST = 5;

export function PieceBreakdown({
	pieceStats,
	overallAccuracy,
}: {
	pieceStats: PieceStats;
	overallAccuracy: number;
}) {
	const pieces: ChessPiece[] = [
		"pawn",
		"knight",
		"bishop",
		"rook",
		"queen",
		"king",
	];
	const activePieces = pieces.filter((p) => pieceStats[p].moveCount > 0);

	if (activePieces.length === 0) return null;

	const weakest = findWeakestPiece(activePieces, pieceStats);

	return (
		<div>
			<p className="mb-2 text-xs text-muted-foreground">By piece</p>
			{activePieces.map((piece) => {
				const s = pieceStats[piece];
				const diff = s.accuracy - overallAccuracy;
				return (
					<div
						key={piece}
						className="border-b border-border/50 py-2 last:border-0"
					>
						<div className="flex items-center justify-between">
							<span className="text-sm capitalize">{piece}</span>
							<div className="flex items-center gap-1.5">
								<span className="text-sm font-medium">{s.accuracy}%</span>
								<span className="text-xs text-muted-foreground">
									{s.moveCount} moves
								</span>
								{piece === weakest && (
									<Badge
										variant="outline"
										className="border-none bg-destructive/15 text-[11px] text-red-700 dark:text-red-300"
									>
										weakest
									</Badge>
								)}
							</div>
						</div>
						<AccuracyBar accuracy={s.accuracy} diff={diff} />
					</div>
				);
			})}
		</div>
	);
}

function findWeakestPiece(
	activePieces: ChessPiece[],
	pieceStats: PieceStats,
): ChessPiece | null {
	const eligible = activePieces.filter(
		(p) => pieceStats[p].moveCount >= MIN_MOVES_FOR_WEAKEST,
	);
	if (eligible.length <= 1) return null;
	return eligible.reduce((min, p) =>
		pieceStats[p].accuracy < pieceStats[min].accuracy ? p : min,
	);
}

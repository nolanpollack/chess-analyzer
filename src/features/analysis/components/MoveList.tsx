import { useEffect, useRef } from "react";
import type { MoveAnalysis } from "#/db/schema";
import {
	formatEvalDisplay,
	getClassificationStyle,
} from "#/features/analysis/utils";
import { cn } from "#/lib/utils";

type MoveListProps = {
	moves: MoveAnalysis[];
	currentPly: number;
	onSelectMove: (ply: number) => void;
};

export function MoveList({ moves, currentPly, onSelectMove }: MoveListProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const selectedRef = useRef<HTMLTableRowElement>(null);

	// Auto-scroll to keep the selected move visible
	// biome-ignore lint/correctness/useExhaustiveDependencies: currentPly triggers scroll when selection changes
	useEffect(() => {
		if (selectedRef.current && containerRef.current) {
			const container = containerRef.current;
			const element = selectedRef.current;
			const containerRect = container.getBoundingClientRect();
			const elementRect = element.getBoundingClientRect();

			if (
				elementRect.top < containerRect.top ||
				elementRect.bottom > containerRect.bottom
			) {
				element.scrollIntoView({ block: "nearest", behavior: "smooth" });
			}
		}
	}, [currentPly]);

	// Group moves into pairs (white + black per move number)
	const movePairs: {
		moveNumber: number;
		white?: MoveAnalysis;
		black?: MoveAnalysis;
	}[] = [];

	for (const move of moves) {
		const moveNumber = Math.ceil(move.ply / 2);
		const isWhite = move.ply % 2 === 1;

		let pair = movePairs.find((p) => p.moveNumber === moveNumber);
		if (!pair) {
			pair = { moveNumber };
			movePairs.push(pair);
		}

		if (isWhite) {
			pair.white = move;
		} else {
			pair.black = move;
		}
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-card">
			<div className="px-4 pt-3 pb-2">
				<p className="text-sm font-medium text-muted-foreground">Moves</p>
			</div>
			<div
				ref={containerRef}
				className="min-h-0 flex-1 overflow-y-auto px-4 pb-3"
			>
				<table className="w-full border-collapse text-sm">
					<thead className="sticky top-0 z-10 bg-card">
						<tr className="text-xs uppercase tracking-wide text-muted-foreground">
							<td className="w-8 py-1">#</td>
							<td className="px-2 py-1">White</td>
							<td className="px-2 py-1">Black</td>
							<td className="py-1 text-right">Eval</td>
						</tr>
					</thead>
					<tbody>
						{movePairs.map((pair) => {
							const lastMove = pair.black ?? pair.white;
							const isSelected =
								pair.white?.ply === currentPly ||
								pair.black?.ply === currentPly;

							return (
								<tr
									key={pair.moveNumber}
									ref={isSelected ? selectedRef : undefined}
									className="border-t border-border/50 cursor-pointer transition-colors duration-150 hover:bg-accent/50"
									onClick={() => {
										if (pair.black?.ply === currentPly && pair.white) {
											onSelectMove(pair.white.ply);
										} else if (pair.white?.ply === currentPly && pair.black) {
											onSelectMove(pair.black.ply);
										} else if (pair.white) {
											onSelectMove(pair.white.ply);
										}
									}}
								>
									<td className="py-1.5 text-muted-foreground tabular-nums">
										{pair.moveNumber}
									</td>
									<td className="py-1.5 px-2">
										<MoveCell
											move={pair.white}
											isSelected={pair.white?.ply === currentPly}
											onSelect={() =>
												pair.white && onSelectMove(pair.white.ply)
											}
										/>
									</td>
									<td className="py-1.5 px-2">
										<MoveCell
											move={pair.black}
											isSelected={pair.black?.ply === currentPly}
											onSelect={() =>
												pair.black && onSelectMove(pair.black.ply)
											}
										/>
									</td>
									<td className="py-1.5 text-right text-xs text-muted-foreground tabular-nums">
										{lastMove ? formatEvalDisplay(lastMove.eval_after) : null}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}

type MoveCellProps = {
	move?: MoveAnalysis;
	isSelected: boolean;
	onSelect: () => void;
};

function MoveCell({ move, isSelected, onSelect }: MoveCellProps) {
	if (!move) {
		return null;
	}

	const style = getClassificationStyle(move.classification);
	const showClassColor =
		move.classification !== "good" && move.classification !== "best";

	return (
		<button
			type="button"
			className={cn(
				"rounded px-1.5 py-0.5 text-left text-sm transition-colors duration-150",
				isSelected && !showClassColor && "bg-foreground/10 font-medium",
				showClassColor && `${style.bg} ${style.text} font-medium`,
				isSelected && showClassColor && "ring-1 ring-foreground/20",
			)}
			onClick={(e) => {
				e.stopPropagation();
				onSelect();
			}}
		>
			{move.san}
		</button>
	);
}

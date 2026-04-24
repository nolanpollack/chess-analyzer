import { ClassChip } from "#/components/ui/class-chip";
import { MoveCell } from "#/features/game/components/MoveCell";
import type { FlatMove } from "#/features/game/types";

type MoveListCardProps = {
	moves: FlatMove[];
	cursor: number;
	onSelect: (index: number) => void;
};

type Pair = {
	moveNumber: number;
	white: FlatMove | null;
	black: FlatMove | null;
};

function groupIntoPairs(moves: FlatMove[]): Pair[] {
	const pairs = new Map<number, Pair>();
	for (const m of moves) {
		const existing = pairs.get(m.moveNumber) ?? {
			moveNumber: m.moveNumber,
			white: null,
			black: null,
		};
		if (m.side === "white") existing.white = m;
		else existing.black = m;
		pairs.set(m.moveNumber, existing);
	}
	return [...pairs.values()].sort((a, b) => a.moveNumber - b.moveNumber);
}

function countPlayerClass(
	moves: FlatMove[],
	cls: "blunder" | "mistake" | "inaccuracy",
) {
	return moves.filter((m) => m.is_player_move && m.classification === cls)
		.length;
}

export function MoveListCard({ moves, cursor, onSelect }: MoveListCardProps) {
	const pairs = groupIntoPairs(moves);
	const blunders = countPlayerClass(moves, "blunder");
	const mistakes = countPlayerClass(moves, "mistake");
	const inaccuracies = countPlayerClass(moves, "inaccuracy");

	return (
		<div className="flex min-h-0 flex-col rounded-[10px] border border-divider bg-surface">
			<div className="flex flex-wrap items-center gap-2 border-b border-divider px-5 py-3.5">
				<div className="text-2xs uppercase tracking-[0.08em] text-fg-3">
					Moves
				</div>
				<div className="ml-auto flex flex-wrap gap-1.5">
					<ClassChip cls="blunder" count={blunders} />
					<ClassChip cls="mistake" count={mistakes} />
					<ClassChip cls="inaccuracy" count={inaccuracies} />
				</div>
			</div>
			<div className="max-h-[420px] overflow-y-auto px-3 py-2">
				<table className="w-full">
					<tbody>
						{pairs.map((p) => (
							<tr key={p.moveNumber}>
								<td className="w-[34px] py-0.5 pl-2 pr-2 mono-nums font-mono text-[11.5px] text-fg-4">
									{p.moveNumber}.
								</td>
								<td className="w-1/2 py-0.5 pr-1">
									<MoveCell
										move={p.white}
										active={p.white?.index === cursor}
										onClick={() => p.white && onSelect(p.white.index)}
									/>
								</td>
								<td className="w-1/2 py-0.5">
									<MoveCell
										move={p.black}
										active={p.black?.index === cursor}
										onClick={() => p.black && onSelect(p.black.index)}
									/>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

import { AccuracyBar } from "#/components/AccuracyBar";
import { Badge } from "#/components/ui/badge";
import type { GamePhase } from "#/db/schema";
import type { GamePerformanceData } from "#/features/profile/types";

const MIN_MOVES_FOR_WEAKEST = 5;

type PhaseInfo = {
	key: GamePhase;
	label: string;
	accuracy: number | null;
	cpLoss: number | null;
	moveCount: number;
};

export function PhaseBreakdown({ perf }: { perf: GamePerformanceData }) {
	const phases = buildPhases(perf);
	const withData = phases.filter(
		(p) => p.accuracy !== null && p.moveCount >= MIN_MOVES_FOR_WEAKEST,
	);
	const weakest = findWeakestPhase(withData);

	return (
		<div className="mb-4">
			<p className="mb-2 text-xs text-muted-foreground">By phase</p>
			{phases.map((phase) => (
				<PhaseRow
					key={phase.key}
					phase={phase}
					isWeakest={weakest === phase.key}
					overallAccuracy={perf.overallAccuracy}
				/>
			))}
		</div>
	);
}

function buildPhases(perf: GamePerformanceData): PhaseInfo[] {
	return [
		{
			key: "opening",
			label: "Opening",
			accuracy: perf.openingAccuracy,
			cpLoss: perf.openingAvgCpLoss,
			moveCount: perf.openingMoveCount,
		},
		{
			key: "middlegame",
			label: "Middlegame",
			accuracy: perf.middlegameAccuracy,
			cpLoss: perf.middlegameAvgCpLoss,
			moveCount: perf.middlegameMoveCount,
		},
		{
			key: "endgame",
			label: "Endgame",
			accuracy: perf.endgameAccuracy,
			cpLoss: perf.endgameAvgCpLoss,
			moveCount: perf.endgameMoveCount,
		},
	];
}

function PhaseRow({
	phase,
	isWeakest,
	overallAccuracy,
}: {
	phase: PhaseInfo;
	isWeakest: boolean;
	overallAccuracy: number;
}) {
	if (phase.moveCount === 0) {
		return (
			<div className="flex items-center justify-between border-b border-border/50 py-2 last:border-0">
				<span className="text-sm">{phase.label}</span>
				<span className="text-sm text-muted-foreground">N/A</span>
			</div>
		);
	}

	const diff = (phase.accuracy ?? 0) - overallAccuracy;

	return (
		<div className="border-b border-border/50 py-2 last:border-0">
			<div className="flex items-center justify-between">
				<span className="text-sm">{phase.label}</span>
				<div className="flex items-center gap-1.5">
					<span className="text-sm font-medium">{phase.accuracy}%</span>
					{phase.cpLoss !== null && (
						<span className="text-xs text-muted-foreground">
							{phase.cpLoss} cp avg
						</span>
					)}
					{isWeakest && (
						<Badge
							variant="outline"
							className="border-none bg-destructive/15 text-[11px] text-red-700 dark:text-red-300"
						>
							weakest
						</Badge>
					)}
				</div>
			</div>
			<AccuracyBar accuracy={phase.accuracy ?? 0} diff={diff} />
		</div>
	);
}

function findWeakestPhase(
	phases: { key: GamePhase; accuracy: number | null }[],
): GamePhase | null {
	if (phases.length <= 1) return null;
	let min = phases[0];
	for (const p of phases) {
		if (
			p.accuracy !== null &&
			(min.accuracy === null || p.accuracy < min.accuracy)
		) {
			min = p;
		}
	}
	return min.key;
}

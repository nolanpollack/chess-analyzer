import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import type { GameSummary } from "#/features/games/types";
import { GameResultPill } from "./GameResultPill";
import { GameScoreCell } from "./GameScoreCell";

export type AnalysisProgress = {
	status: "pending" | "in-progress" | "complete" | "failed";
	movesAnalyzed: number;
	totalMoves: number;
};

type RecentGameRowProps = {
	game: GameSummary;
	username: string;
	/** Optional analysis progress; when omitted, renders as today (assumes complete). */
	analysis?: AnalysisProgress;
};

export function RecentGameRow({
	game,
	username,
	analysis,
}: RecentGameRowProps) {
	const navigate = useNavigate();
	return (
		<tr
			onClick={() =>
				navigate({
					to: "/$username/games/$gameId",
					params: { username, gameId: game.id },
				})
			}
			className="cursor-pointer transition-colors duration-100 hover:bg-surface-2"
		>
			<td className="py-3.5 pl-5 pr-3">
				<GameResultPill result={game.result} />
			</td>
			<td className="px-3 py-3.5">
				<div className="flex items-center gap-2">
					<span
						className={`h-2 w-2 shrink-0 rounded-[2px] border border-border-strong ${game.color === "white" ? "bg-surface-3" : "bg-fg-1"}`}
					/>
					<span className="text-ui font-medium text-fg-1">{game.opp}</span>
					<span className="mono-nums font-mono text-xs text-fg-3">
						{game.oppElo}
					</span>
				</div>
			</td>
			<td className="px-3 py-3.5 text-ui text-fg-2">{game.opening}</td>
			<td className="px-3 py-3.5">
				<span className="mono-nums font-mono text-xs text-fg-2">
					{game.time}
				</span>
			</td>
			<td className="px-3 py-3.5 text-right">
				<AccuracyCell game={game} analysis={analysis} />
			</td>
			<td className="px-3 py-3.5 text-right">
				<GameScoreCell score={game.score} />
			</td>
			<td className="py-3.5 pl-3 pr-5 text-right text-xs text-fg-3">
				{game.when}
			</td>
		</tr>
	);
}

function AccuracyCell({
	game,
	analysis,
}: {
	game: GameSummary;
	analysis?: AnalysisProgress;
}) {
	if (!analysis || analysis.status === "complete") {
		return (
			<span className="mono-nums font-mono text-ui">
				{game.acc !== null ? `${game.acc.toFixed(1)}%` : "—"}
			</span>
		);
	}
	if (analysis.status === "failed") {
		return (
			<span
				className="inline-flex items-center justify-end gap-1 text-ui text-blunder"
				title="Analysis failed"
			>
				<AlertTriangle className="size-3" aria-hidden="true" />
				<span className="mono-nums font-mono">—</span>
			</span>
		);
	}
	return <AnalysisProgressInline progress={analysis} />;
}

function AnalysisProgressInline({ progress }: { progress: AnalysisProgress }) {
	const { status, movesAnalyzed, totalMoves } = progress;
	const isPending = status === "pending" || movesAnalyzed === 0;
	const pct =
		!isPending && totalMoves > 0
			? Math.min(100, Math.round((movesAnalyzed / totalMoves) * 100))
			: 0;

	const countLabel =
		totalMoves > 0 ? `${movesAnalyzed} / ${totalMoves}` : "Pending";

	return (
		<div
			aria-live="polite"
			aria-busy="true"
			className="inline-flex items-center justify-end gap-2"
		>
			<span className="mono-nums font-mono text-xs text-fg-3">
				{countLabel}
			</span>
			<span
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={isPending ? undefined : pct}
				className="relative block h-1 w-12 overflow-hidden rounded-full bg-surface-3"
			>
				{isPending ? (
					<span className="absolute inset-y-0 left-0 w-1/3 animate-pulse rounded-full bg-fg-4/50" />
				) : (
					<span
						className="absolute inset-y-0 left-0 rounded-full bg-fg-3 transition-all"
						style={{ width: `${pct}%` }}
					/>
				)}
			</span>
		</div>
	);
}

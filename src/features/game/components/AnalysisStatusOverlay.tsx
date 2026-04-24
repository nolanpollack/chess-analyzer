import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import {
	resetAndTriggerAnalysis,
	triggerAnalysis,
} from "#/features/game/server/mutations";
import { getAnalysisStatus } from "#/features/game/server/queries";

type AnalysisStatusOverlayProps = {
	gameId: string;
	status: "pending" | "complete" | "failed" | null;
	errorMessage: string | null;
};

export function AnalysisStatusOverlay({
	gameId,
	status,
	errorMessage,
}: AnalysisStatusOverlayProps) {
	const queryClient = useQueryClient();

	const progress = useQuery({
		queryKey: ["analysisStatus", gameId],
		queryFn: async () => {
			const result = await getAnalysisStatus({ data: { gameId } });
			if (!("status" in result)) throw new Error(result.error);
			return result;
		},
		enabled: status === "pending",
		refetchInterval: 3000,
	});

	const trigger = useMutation({
		mutationFn: async () => {
			const fn =
				status === "failed" ? resetAndTriggerAnalysis : triggerAnalysis;
			const result = await fn({ data: { gameId } });
			if ("error" in result) throw new Error(result.error);
			return result;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["gameDetail", gameId] });
		},
	});

	const movesAnalyzed = progress.data?.movesAnalyzed ?? 0;
	const totalMoves = progress.data?.totalMoves ?? null;
	const pct =
		totalMoves && totalMoves > 0
			? Math.round((movesAnalyzed / totalMoves) * 100)
			: null;

	return (
		<div className="rounded-[10px] border border-divider bg-surface px-6 py-8 text-center">
			<Sparkles className="mx-auto h-5 w-5 text-fg-3" />
			<h2 className="mt-3 text-base font-medium text-fg-1">
				{status === "pending"
					? "Analyzing game…"
					: status === "failed"
						? "Analysis failed"
						: "Not analyzed yet"}
			</h2>
			<p className="mx-auto mt-2 max-w-md text-ui text-fg-2">
				{status === "pending"
					? "Stockfish is reviewing every move. This usually takes under a minute."
					: status === "failed"
						? (errorMessage ??
							"Something went wrong while analyzing this game.")
						: "Run engine analysis to unlock move classifications, best moves, and explanations."}
			</p>

			{status === "pending" && totalMoves !== null && (
				<div className="mx-auto mt-4 max-w-md">
					<div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
						<div
							className="h-full bg-accent-brand transition-[width] duration-300"
							style={{ width: `${pct ?? 0}%` }}
						/>
					</div>
					<div className="mt-2 mono-nums font-mono text-2xs text-fg-3">
						{movesAnalyzed} / {totalMoves} moves
					</div>
				</div>
			)}

			{(status === null || status === "failed") && (
				<button
					type="button"
					onClick={() => trigger.mutate()}
					disabled={trigger.isPending}
					className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-[6px] border border-divider bg-surface-2 px-4 py-2 text-ui font-medium text-fg-1 transition-colors duration-[100ms] hover:bg-surface-3 disabled:cursor-wait disabled:opacity-70"
				>
					{trigger.isPending
						? "Queuing…"
						: status === "failed"
							? "Retry analysis"
							: "Analyze game"}
				</button>
			)}
			{trigger.error && (
				<p className="mt-2 text-xs text-blunder">{trigger.error.message}</p>
			)}
		</div>
	);
}

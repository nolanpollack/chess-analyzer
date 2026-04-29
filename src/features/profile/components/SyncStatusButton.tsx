import { AlertTriangle } from "lucide-react";
import { usePlayerStatus } from "#/features/players/hooks/use-player-status";
import { useSyncPlayer } from "#/features/players/hooks/use-sync-player";
import { formatRelativeTime } from "#/lib/date";

export type SyncProgress = {
	status: "idle" | "syncing" | "complete" | "failed";
	gamesImported: number;
	totalGamesToImport: number; // 0 if unknown
	gamesAnalyzed: number; // out of gamesImported
};

type SyncStatusButtonProps = {
	username: string;
	/**
	 * Optional progress override — when provided, drives the UI directly
	 * instead of the live `usePlayerStatus` flag. Used by the preview route
	 * and (eventually) by the real-data wiring.
	 */
	progress?: SyncProgress;
};

export function SyncStatusButton({
	username,
	progress,
}: SyncStatusButtonProps) {
	const { sync } = useSyncPlayer(username);
	const { player, isSyncing, isLoading } = usePlayerStatus(username);

	const effectiveStatus: SyncProgress["status"] = progress
		? progress.status
		: isSyncing
			? "syncing"
			: "idle";

	const showProgressStrip = progress && effectiveStatus === "syncing";
	const showFailed = effectiveStatus === "failed";

	return (
		<button
			type="button"
			onClick={() => sync()}
			disabled={effectiveStatus === "syncing"}
			className="relative inline-flex cursor-pointer items-center gap-2 overflow-hidden rounded-sm border-none bg-transparent px-3 py-1.5 text-ui font-medium text-fg-1 transition-all duration-100 hover:bg-surface-2"
		>
			<StatusDot status={effectiveStatus} />
			<span className="text-xs text-fg-2">
				{getLabel({
					status: effectiveStatus,
					isLoading,
					lastSyncedAt: player?.lastSyncedAt ?? null,
					progress,
				})}
			</span>
			{showFailed && (
				<AlertTriangle className="size-3 text-blunder" aria-hidden="true" />
			)}
			{showProgressStrip && progress && <ProgressStrip progress={progress} />}
		</button>
	);
}

function StatusDot({ status }: { status: SyncProgress["status"] }) {
	const cls =
		status === "syncing"
			? "animate-pulse bg-data-3"
			: status === "failed"
				? "bg-blunder"
				: "bg-data-6";
	return <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />;
}

function getLabel({
	status,
	isLoading,
	lastSyncedAt,
	progress,
}: {
	status: SyncProgress["status"];
	isLoading: boolean;
	lastSyncedAt: string | null;
	progress?: SyncProgress;
}) {
	if (status === "syncing") {
		if (progress) {
			const { gamesImported, totalGamesToImport, gamesAnalyzed } = progress;
			if (totalGamesToImport > 0) {
				return `Syncing ${gamesImported} / ${totalGamesToImport} · ${gamesAnalyzed} analyzed`;
			}
			return `Syncing · ${gamesImported} imported · ${gamesAnalyzed} analyzed`;
		}
		return "Syncing…";
	}
	if (status === "failed") {
		return "Sync failed";
	}
	if (lastSyncedAt) {
		return `Synced ${formatRelativeTime(lastSyncedAt)}`;
	}
	if (isLoading) {
		return "Loading…";
	}
	return "Never synced";
}

function ProgressStrip({ progress }: { progress: SyncProgress }) {
	const { gamesImported, totalGamesToImport, gamesAnalyzed } = progress;
	const totalKnown = totalGamesToImport > 0;
	const importPct = totalKnown
		? Math.min(100, Math.round((gamesImported / totalGamesToImport) * 100))
		: null;
	const analyzedPct =
		gamesImported > 0
			? Math.min(100, Math.round((gamesAnalyzed / gamesImported) * 100)) *
				((importPct ?? 0) / 100)
			: 0;

	return (
		<span
			aria-hidden="true"
			className="pointer-events-none absolute inset-x-0 bottom-0 block h-[2px] bg-surface-3"
		>
			{importPct === null ? (
				<span className="absolute inset-y-0 left-0 w-1/3 animate-pulse bg-fg-4/60" />
			) : (
				<>
					<span
						className="absolute inset-y-0 left-0 bg-fg-4 transition-all"
						style={{ width: `${importPct}%` }}
					/>
					<span
						className="absolute inset-y-0 left-0 bg-fg-2 transition-all"
						style={{ width: `${analyzedPct}%` }}
					/>
				</>
			)}
		</span>
	);
}

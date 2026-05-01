import { AlertTriangle } from "lucide-react";
import { usePlayerStatus } from "#/features/players/hooks/use-player-status";
import type { ProfileProgress } from "#/features/players/hooks/use-profile-progress";
import { useSyncPlayer } from "#/features/players/hooks/use-sync-player";
import { formatRelativeTime } from "#/lib/date";

type SyncStatusButtonProps = {
	username: string;
	/**
	 * Combined sync + analysis progress. Optional — when omitted the button
	 * still works in a degraded "Syncing… / Synced X ago" mode, but the
	 * production usage on the profile route always supplies it.
	 */
	progress?: ProfileProgress | null;
};

export function SyncStatusButton({
	username,
	progress,
}: SyncStatusButtonProps) {
	const { sync } = useSyncPlayer(username);
	const { player, isSyncing, isLoading } = usePlayerStatus(username);

	const state: ProfileProgress["state"] = progress
		? progress.state
		: isSyncing
			? "syncing"
			: "idle";

	const lastSyncedAt = progress?.lastSyncedAt ?? player?.lastSyncedAt ?? null;
	const showFailed = false; // No "failed" sync state in the unified shape yet.
	const showPopover = progress != null && progress.state !== "idle";

	return (
		<div className="group relative">
			<button
				type="button"
				onClick={() => sync()}
				disabled={state === "syncing"}
				className="inline-flex cursor-pointer items-center gap-2 rounded-sm border-none bg-transparent px-3 py-1.5 text-ui font-medium text-fg-1 transition-all duration-100 hover:bg-surface-2"
			>
				<StatusDot state={state} />
				<span className="text-xs text-fg-2">
					{getLabel({ state, isLoading, lastSyncedAt, progress })}
				</span>
				{showFailed && (
					<AlertTriangle className="size-3 text-blunder" aria-hidden="true" />
				)}
			</button>
			{showPopover && progress && (
				<div className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden group-hover:block group-focus-within:block">
					<ProgressPopover progress={progress} />
				</div>
			)}
		</div>
	);
}

function StatusDot({ state }: { state: ProfileProgress["state"] }) {
	// Amber while pulling games (matches the warm theme accent), monochrome
	// while local analysis is catching up, green when caught up.
	const cls =
		state === "syncing"
			? "animate-pulse bg-data-3"
			: state === "analyzing"
				? "animate-pulse bg-accent-brand"
				: "bg-data-6";
	return <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />;
}

function getLabel({
	state,
	isLoading,
	lastSyncedAt,
	progress,
}: {
	state: ProfileProgress["state"];
	isLoading: boolean;
	lastSyncedAt: string | null;
	progress?: ProfileProgress | null;
}) {
	if (state === "syncing") return "Syncing…";
	if (state === "analyzing" && progress) {
		const slowest = Math.min(
			progress.accuracy,
			progress.gameRating,
			progress.patterns,
		);
		const remaining = progress.imported - slowest;
		return `${remaining} left to analyze`;
	}
	if (lastSyncedAt) return `Synced ${formatRelativeTime(lastSyncedAt)}`;
	if (isLoading) return "Loading…";
	return "Never synced";
}


function ProgressPopover({ progress }: { progress: ProfileProgress }) {
	const rows = [
		{ label: "Accuracy", done: progress.accuracy },
		{ label: "Game rating", done: progress.gameRating },
		{ label: "Patterns", done: progress.patterns },
	];
	return (
		<div
			role="tooltip"
			className="w-52 rounded-md border border-divider bg-surface-2 p-3 shadow-md"
		>
			<div className="mb-2 text-2xs uppercase tracking-label text-fg-3">
				Analysis progress
			</div>
			<div className="space-y-1.5">
				{rows.map((row) => {
					const remaining = progress.imported - row.done;
					const caughtUp = remaining <= 0;
					return (
						<div
							key={row.label}
							className="flex items-center justify-between gap-4"
						>
							<span className="text-xs text-fg-2">{row.label}</span>
							<span
								className={`mono-nums font-mono text-2xs ${caughtUp ? "text-fg-4" : "text-fg-1"}`}
							>
								{caughtUp ? "done" : `${remaining} left`}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

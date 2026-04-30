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
	const showStrip = state !== "idle" && progress != null;
	const showPopover = progress != null && progress.state !== "idle";

	return (
		<div className="group relative">
			<button
				type="button"
				onClick={() => sync()}
				disabled={state === "syncing"}
				className="relative inline-flex cursor-pointer items-center gap-2 overflow-hidden rounded-sm border-none bg-transparent px-3 py-1.5 text-ui font-medium text-fg-1 transition-all duration-100 hover:bg-surface-2"
			>
				<StatusDot state={state} />
				<span className="text-xs text-fg-2">
					{getLabel({ state, isLoading, lastSyncedAt, progress })}
				</span>
				{showFailed && (
					<AlertTriangle className="size-3 text-blunder" aria-hidden="true" />
				)}
				{showStrip && progress && <ProgressStrip progress={progress} />}
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
	if (state === "syncing") {
		if (progress) {
			const total = progress.totalGamesToImport;
			if (total > 0) return `Syncing ${progress.imported} of ${total}`;
			return `Syncing · ${progress.imported} imported`;
		}
		return "Syncing…";
	}
	if (state === "analyzing" && progress) {
		// Headline = the slowest stage, since that's what gates "fully analyzed".
		const slowest = Math.min(
			progress.accuracy,
			progress.gameRating,
			progress.patterns,
		);
		return `Analyzing ${slowest} of ${progress.imported}`;
	}
	if (lastSyncedAt) return `Synced ${formatRelativeTime(lastSyncedAt)}`;
	if (isLoading) return "Loading…";
	return "Never synced";
}

function ProgressStrip({ progress }: { progress: ProfileProgress }) {
	// Single bar over the surface-3 track. Color matches the dot:
	// amber while syncing, blue while analyzing.
	const isSyncing = progress.state === "syncing";

	const pct = isSyncing
		? progress.totalGamesToImport > 0
			? Math.min(
					100,
					Math.round((progress.imported / progress.totalGamesToImport) * 100),
				)
			: 0
		: progress.imported > 0
			? Math.min(
					100,
					Math.round(
						(Math.min(
							progress.accuracy,
							progress.gameRating,
							progress.patterns,
						) /
							progress.imported) *
							100,
					),
				)
			: 0;

	const showIndeterminate = isSyncing && progress.totalGamesToImport === 0;
	const barColor = isSyncing ? "bg-data-3" : "bg-accent-brand";

	return (
		<span
			aria-hidden="true"
			className="pointer-events-none absolute inset-x-0 bottom-0 block h-0.5 bg-surface-3"
		>
			{showIndeterminate ? (
				<span
					className={`absolute inset-y-0 left-0 w-1/3 animate-pulse ${barColor}`}
				/>
			) : (
				<span
					className={`absolute inset-y-0 left-0 ${barColor} transition-all`}
					style={{ width: `${pct}%` }}
				/>
			)}
		</span>
	);
}

function ProgressPopover({ progress }: { progress: ProfileProgress }) {
	const rows: { label: string; done: number; description: string }[] = [
		{
			label: "Accuracy",
			done: progress.accuracy,
			description: "How precisely you played",
		},
		{
			label: "Game rating",
			done: progress.gameRating,
			description: "How well you played overall",
		},
		{
			label: "Patterns",
			done: progress.patterns,
			description: "Recurring strengths and weaknesses",
		},
	];
	return (
		<div
			role="tooltip"
			className="w-72 rounded-md border border-divider bg-surface-2 p-4 shadow-md"
		>
			<div className="mb-3 text-2xs uppercase tracking-label text-fg-3">
				Analysis progress
			</div>
			<div className="divide-y divide-divider">
				{rows.map((row, i) => (
					<div key={row.label} className={i === 0 ? "pb-3" : "py-3 last:pb-0"}>
						<StageRow
							label={row.label}
							description={row.description}
							done={row.done}
							total={progress.imported}
						/>
					</div>
				))}
			</div>
		</div>
	);
}

function StageRow({
	label,
	description,
	done,
	total,
}: {
	label: string;
	description: string;
	done: number;
	total: number;
}) {
	const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
	const caughtUp = total === 0 || done >= total;
	return (
		<div>
			<div className="flex items-baseline justify-between gap-3">
				<div className="text-xs font-medium text-fg-1">{label}</div>
				<div className="mono-nums font-mono text-2xs text-fg-3">
					{done} / {total}
				</div>
			</div>
			<div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-surface-3">
				<span
					className={`block h-full transition-all ${caughtUp ? "bg-fg-4" : "bg-accent-brand"}`}
					style={{ width: `${pct}%` }}
				/>
			</div>
			<div className="mt-2 text-2xs leading-snug text-fg-3">{description}</div>
		</div>
	);
}

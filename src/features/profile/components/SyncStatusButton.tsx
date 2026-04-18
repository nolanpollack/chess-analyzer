import { useSyncStatus } from "#/features/profile/hooks/use-sync-status";

type SyncStatusButtonProps = {
	username: string;
};

export function SyncStatusButton({ username }: SyncStatusButtonProps) {
	const { isSyncing, lastSyncedAt, syncMutation } = useSyncStatus(username);

	const lastSyncedLabel = lastSyncedAt
		? formatRelativeTime(lastSyncedAt)
		: "never synced";

	return (
		<button
			type="button"
			onClick={() => syncMutation.mutate()}
			disabled={isSyncing}
			className="inline-flex cursor-pointer items-center gap-2 rounded-[6px] border-none bg-transparent px-3 py-[6px] text-[13px] font-medium text-fg-1 transition-all duration-[120ms] hover:bg-surface-2"
		>
			<span
				className={`h-[6px] w-[6px] rounded-full ${isSyncing ? "animate-pulse bg-data-3" : "bg-data-6"}`}
			/>
			<span className="text-[12px] text-fg-2">
				{isSyncing ? "Syncing…" : `Synced ${lastSyncedLabel}`}
			</span>
		</button>
	);
}

function formatRelativeTime(isoString: string): string {
	const now = Date.now();
	const then = new Date(isoString).getTime();
	const diffMs = now - then;
	const diffMin = Math.floor(diffMs / 60_000);

	if (diffMin < 1) return "just now";
	if (diffMin < 60) return `${diffMin} min ago`;

	const diffHours = Math.floor(diffMin / 60);
	if (diffHours < 24) return `${diffHours}h ago`;

	const diffDays = Math.floor(diffHours / 24);
	return `${diffDays}d ago`;
}

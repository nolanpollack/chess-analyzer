import { useSyncStatus } from "#/features/profile/hooks/use-sync-status";
import { formatRelativeTime } from "#/lib/date";

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
			className="inline-flex cursor-pointer items-center gap-2 rounded-sm border-none bg-transparent px-3 py-1.5 text-[13px] font-medium text-fg-1 transition-all duration-100 hover:bg-surface-2"
		>
			<span
				className={`h-1.5 w-1.5 rounded-full ${isSyncing ? "animate-pulse bg-data-3" : "bg-data-6"}`}
			/>
			<span className="text-xs text-fg-2">
				{isSyncing ? "Syncing…" : `Synced ${lastSyncedLabel}`}
			</span>
		</button>
	);
}

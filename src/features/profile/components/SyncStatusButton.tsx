import { usePlayerStatus } from "#/features/players/hooks/use-player-status";
import { useSyncPlayer } from "#/features/players/hooks/use-sync-player";
import { formatRelativeTime } from "#/lib/date";

type SyncStatusButtonProps = {
	username: string;
};

export function SyncStatusButton({ username }: SyncStatusButtonProps) {
	const { sync } = useSyncPlayer(username);
	const { player, isSyncing, isLoading } = usePlayerStatus(username);

	return (
		<button
			type="button"
			onClick={() => sync()}
			disabled={isSyncing}
			className="inline-flex cursor-pointer items-center gap-2 rounded-sm border-none bg-transparent px-3 py-1.5 text-ui font-medium text-fg-1 transition-all duration-100 hover:bg-surface-2"
		>
			<span
				className={`h-1.5 w-1.5 rounded-full ${isSyncing ? "animate-pulse bg-data-3" : "bg-data-6"}`}
			/>
			<span className="text-xs text-fg-2">
				{getSyncLabel(isSyncing, isLoading, player?.lastSyncedAt ?? null)}
			</span>
		</button>
	);
}

function getSyncLabel(
	isSyncing: boolean,
	isLoading: boolean,
	lastSyncedAt: string | null,
) {
	if (isSyncing) {
		return "Syncing…";
	}
	if (lastSyncedAt) {
		return `Synced ${formatRelativeTime(lastSyncedAt)}`;
	}
	if (isLoading) {
		return "Loading…";
	}
	return "Never synced";
}

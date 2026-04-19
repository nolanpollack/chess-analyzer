import { formatRelativeTime } from "#/lib/date";
import { usePlayerStatus } from "#/features/players/hooks/use-player-status";
import { useSyncPlayer } from "#/features/players/hooks/use-sync-player";

type SyncStatusButtonProps = {
  username: string;
};

export function SyncStatusButton({ username }: SyncStatusButtonProps) {
  const { sync } = useSyncPlayer(username);
  const { player, isSyncing, isLoading } = usePlayerStatus(username);

  const lastSyncedAt = player?.lastSyncedAt ?? null;

  const lastSyncedLabel = lastSyncedAt
    ? formatRelativeTime(lastSyncedAt)
    : "never synced";

  return (
    <button
      type="button"
      onClick={() => sync()}
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

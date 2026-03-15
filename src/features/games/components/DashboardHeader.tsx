import { RefreshCw } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";

type PlayerFound = {
	player: {
		username: string;
		lastSyncedAt: string | null;
	};
	isSyncing: boolean;
};

type DashboardHeaderProps = {
	playerStatus: PlayerFound;
	isSyncing: boolean;
	onSync: () => void;
};

export function DashboardHeader({
	playerStatus,
	isSyncing,
	onSync,
}: DashboardHeaderProps) {
	return (
		<div className="flex flex-wrap items-center gap-3">
			<h1 className="text-2xl font-semibold tracking-tight">
				{playerStatus.player.username}
			</h1>
			<Badge variant={isSyncing ? "secondary" : "outline"}>
				{isSyncing ? "Syncing..." : "Synced"}
			</Badge>
			{playerStatus.player.lastSyncedAt && (
				<span className="text-sm text-muted-foreground">
					Last synced:{" "}
					{new Date(playerStatus.player.lastSyncedAt).toLocaleString()}
				</span>
			)}
			<Button
				variant="outline"
				size="sm"
				className="ml-auto"
				disabled={isSyncing}
				onClick={onSync}
			>
				<RefreshCw className={`size-4 ${isSyncing ? "animate-spin" : ""}`} />
				Sync
			</Button>
		</div>
	);
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Skeleton } from "#/components/ui/skeleton";
import { GameFilters } from "#/features/games/components/GameFilters";
import { GameTable } from "#/features/games/components/GameTable";
import { useGames } from "#/features/games/hooks/use-games";
import { usePlayerStatus } from "#/features/games/hooks/use-player-status";
import type { GameFilters as GameFiltersType } from "#/features/games/types";

export const Route = createFileRoute("/$username")({
	component: DashboardPage,
});

function DashboardPage() {
	const { username } = Route.useParams();

	const [filters, setFilters] = useState<GameFiltersType>({
		timeControlClass: undefined,
		result: undefined,
		playerColor: undefined,
		page: 1,
	});

	function updateFilter(update: Partial<Omit<GameFiltersType, "page">>) {
		setFilters((prev) => ({ ...prev, ...update, page: 1 }));
	}

	const statusQuery = usePlayerStatus(username);
	const playerStatus =
		statusQuery.data && "found" in statusQuery.data && statusQuery.data.found
			? statusQuery.data
			: null;

	const gamesQuery = useGames({
		username,
		...filters,
		enabled: playerStatus !== null,
	});

	if (statusQuery.isLoading) {
		return <DashboardSkeleton />;
	}

	if (!playerStatus) {
		return (
			<div className="py-12 text-center">
				<p className="text-sm font-medium">Player not found</p>
				<p className="mt-1 text-sm text-muted-foreground">
					No data found for &ldquo;{username}&rdquo;. Go back and try a
					different username.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<h1 className="text-2xl font-semibold tracking-tight">
					{playerStatus.player.username}
				</h1>
				<Badge variant={playerStatus.isSyncing ? "secondary" : "outline"}>
					{playerStatus.isSyncing ? "Syncing..." : "Synced"}
				</Badge>
				{playerStatus.player.lastSyncedAt && (
					<span className="text-sm text-muted-foreground">
						Last synced:{" "}
						{new Date(playerStatus.player.lastSyncedAt).toLocaleString()}
					</span>
				)}
			</div>

			<GameFilters filters={filters} onUpdate={updateFilter} />

			<GameTable
				gamesData={gamesQuery.data}
				isLoading={gamesQuery.isLoading}
				isSyncing={playerStatus.isSyncing}
				page={filters.page}
				onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
			/>
		</div>
	);
}

function DashboardSkeleton() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-8 w-48" />
			<div className="flex gap-2">
				<Skeleton className="h-10 w-[140px]" />
				<Skeleton className="h-10 w-[120px]" />
				<Skeleton className="h-10 w-[120px]" />
			</div>
			<div className="space-y-2">
				{"sk-0 sk-1 sk-2 sk-3 sk-4 sk-5 sk-6 sk-7 sk-8 sk-9"
					.split(" ")
					.map((k) => (
						<Skeleton key={k} className="h-12 w-full" />
					))}
			</div>
		</div>
	);
}

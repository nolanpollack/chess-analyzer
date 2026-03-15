import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardHeader } from "#/features/games/components/DashboardHeader";
import { DashboardSkeleton } from "#/features/games/components/DashboardSkeleton";
import { GameFilters } from "#/features/games/components/GameFilters";
import { GameTable } from "#/features/games/components/GameTable";
import { useGames } from "#/features/games/hooks/use-games";
import { usePlayerStatus } from "#/features/games/hooks/use-player-status";
import { useSyncPlayer } from "#/features/games/hooks/use-sync-player";
import type { GameFilters as GameFiltersType } from "#/features/games/types";

export const Route = createFileRoute("/$username/")({
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

	const { syncMutation, isSyncing } = useSyncPlayer(
		username,
		playerStatus?.isSyncing ?? false,
	);

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
			<DashboardHeader
				playerStatus={playerStatus}
				isSyncing={isSyncing}
				onSync={() => syncMutation.mutate()}
			/>

			<GameFilters filters={filters} onUpdate={updateFilter} />

			<GameTable
				gamesData={gamesQuery.data}
				isLoading={gamesQuery.isLoading}
				isSyncing={isSyncing}
				page={filters.page}
				onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
				username={username}
			/>
		</div>
	);
}

import { Button } from "#/components/ui/button";
import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { GameRow } from "#/features/games/components/GameRow";
import { GameTableSkeleton } from "#/features/games/components/GameTableSkeleton";
import type { GamesResult } from "#/features/games/types";

// ── GameTable ───────────────────────────────────────────────────────────

type GameTableProps = {
	gamesData: GamesResult | undefined;
	isLoading: boolean;
	isSyncing: boolean;
	page: number;
	onPageChange: (page: number) => void;
	username: string;
};

export function GameTable({
	gamesData,
	isLoading,
	isSyncing,
	page,
	onPageChange,
	username,
}: GameTableProps) {
	// Only show skeleton on the very first load (no data at all yet).
	// During pagination, keepPreviousData keeps gamesData populated so we
	// show the old page dimmed instead of a flash of skeleton.
	if (isLoading && !gamesData) {
		return <GameTableSkeleton />;
	}

	if (!gamesData || gamesData.games.length === 0) {
		return (
			<div className="py-12 text-center text-sm text-muted-foreground">
				{isSyncing
					? "Games are being synced. They will appear here shortly."
					: "No games found matching the selected filters."}
			</div>
		);
	}

	const totalPages = Math.ceil(gamesData.totalCount / gamesData.pageSize);

	return (
		<div
			className={`space-y-4 transition-opacity duration-150${isLoading ? " pointer-events-none opacity-50" : ""}`}
		>
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="text-xs text-muted-foreground uppercase tracking-wide">
								Date
							</TableHead>
							<TableHead className="text-xs text-muted-foreground uppercase tracking-wide">
								Result
							</TableHead>
							<TableHead className="hidden text-xs text-muted-foreground uppercase tracking-wide sm:table-cell">
								Color
							</TableHead>
							<TableHead className="text-xs text-muted-foreground uppercase tracking-wide">
								Opponent
							</TableHead>
							<TableHead className="hidden text-xs text-muted-foreground uppercase tracking-wide md:table-cell">
								Rating
							</TableHead>
							<TableHead className="hidden text-xs text-muted-foreground uppercase tracking-wide lg:table-cell">
								Opening
							</TableHead>
							<TableHead className="hidden text-xs text-muted-foreground uppercase tracking-wide sm:table-cell">
								Speed
							</TableHead>
							<TableHead className="text-xs text-muted-foreground uppercase tracking-wide">
								Analysis
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{gamesData.games.map((game) => (
							<GameRow key={game.id} game={game} username={username} />
						))}
					</TableBody>
				</Table>
			</div>

			<div className="flex items-center justify-between">
				<span className="text-sm text-muted-foreground">
					{gamesData.totalCount} game{gamesData.totalCount !== 1 ? "s" : ""}{" "}
					found
				</span>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1}
						onClick={() => onPageChange(page - 1)}
					>
						Previous
					</Button>
					<span className="flex items-center px-2 text-sm text-muted-foreground">
						Page {page} of {totalPages}
					</span>
					<Button
						variant="outline"
						size="sm"
						disabled={page >= totalPages}
						onClick={() => onPageChange(page + 1)}
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
}

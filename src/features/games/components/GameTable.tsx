import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import type { Game, GamesResult } from "#/features/games/types";
import { classifyResult } from "#/lib/chess-utils";

// ── GameTable ───────────────────────────────────────────────────────────

type GameTableProps = {
	gamesData: GamesResult | undefined;
	isLoading: boolean;
	isSyncing: boolean;
	page: number;
	onPageChange: (page: number) => void;
};

export function GameTable({
	gamesData,
	isLoading,
	isSyncing,
	page,
	onPageChange,
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
							{[
								"Date",
								"Result",
								"Color",
								"Opponent",
								"Rating",
								"Opening",
								"Speed",
							].map((h) => (
								<TableHead
									key={h}
									className="text-xs text-muted-foreground uppercase tracking-wide"
								>
									{h}
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{gamesData.games.map((game) => (
							<GameRow key={game.id} game={game} />
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

// ── GameRow ─────────────────────────────────────────────────────────────

function GameRow({ game }: { game: Game }) {
	let resultCategory: string;
	try {
		resultCategory = classifyResult(game.resultDetail);
	} catch (e) {
		console.warn(`Unknown result code: ${game.resultDetail}`, e);
		resultCategory = game.resultDetail;
	}

	const resultVariant =
		resultCategory === "win"
			? "default"
			: resultCategory === "loss"
				? "destructive"
				: "secondary";

	return (
		<TableRow>
			<TableCell className="whitespace-nowrap">
				{new Date(game.playedAt).toLocaleDateString()}
			</TableCell>
			<TableCell>
				<Badge variant={resultVariant} className="capitalize">
					{resultCategory}
				</Badge>
			</TableCell>
			<TableCell className="capitalize">{game.playerColor}</TableCell>
			<TableCell>{game.opponentUsername}</TableCell>
			<TableCell className="text-right tabular-nums">
				{game.playerRating} vs {game.opponentRating}
			</TableCell>
			<TableCell
				className="max-w-[200px] truncate"
				title={game.openingName ?? undefined}
			>
				{game.openingEco && (
					<span className="mr-1 font-mono text-xs text-muted-foreground">
						{game.openingEco}
					</span>
				)}
				{game.openingName ?? (game.openingEco ? null : "Unknown")}
			</TableCell>
			<TableCell className="capitalize">{game.timeControlClass}</TableCell>
		</TableRow>
	);
}

// ── Skeleton ────────────────────────────────────────────────────────────

function GameTableSkeleton() {
	return (
		<div className="space-y-2">
			{"sk-0 sk-1 sk-2 sk-3 sk-4 sk-5 sk-6 sk-7 sk-8 sk-9"
				.split(" ")
				.map((k) => (
					<Skeleton key={k} className="h-12 w-full" />
				))}
		</div>
	);
}

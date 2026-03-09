import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { classifyResult } from "#/lib/chess-utils";
import { listGames } from "#/server/games";
import { getPlayerStatus } from "#/server/players";

export const Route = createFileRoute("/$username")({
	component: DashboardPage,
});

// ── Types ──────────────────────────────────────────────────────────────

type TimeControlFilter = "bullet" | "blitz" | "rapid" | "classical" | "daily";
type ResultFilter = "win" | "loss" | "draw";
type ColorFilter = "white" | "black";

// ── Component ──────────────────────────────────────────────────────────

function DashboardPage() {
	const { username } = Route.useParams();
	const [page, setPage] = useState(1);
	const [timeControlClass, setTimeControlClass] = useState<
		TimeControlFilter | undefined
	>();
	const [result, setResult] = useState<ResultFilter | undefined>();
	const [playerColor, setPlayerColor] = useState<ColorFilter | undefined>();

	// Poll player status (to detect when sync completes)
	const statusQuery = useQuery({
		queryKey: ["playerStatus", username],
		queryFn: () => getPlayerStatus({ data: { username } }),
		refetchInterval: (query) => {
			const data = query.state.data;
			if (data && "found" in data && data.found && data.isSyncing) {
				return 3000; // Poll every 3s while syncing
			}
			return false;
		},
	});

	// Fetch games
	const gamesQuery = useQuery({
		queryKey: ["games", username, page, timeControlClass, result, playerColor],
		queryFn: () =>
			listGames({
				data: {
					username,
					page,
					pageSize: 20,
					timeControlClass,
					result,
					playerColor,
				},
			}),
		enabled:
			statusQuery.data !== undefined &&
			"found" in statusQuery.data &&
			statusQuery.data.found,
	});

	// Reset page when filters change
	function updateFilter<T>(setter: (v: T) => void, value: T) {
		setter(value);
		setPage(1);
	}

	// ── Loading state ──────────────────────────────────────────────────

	if (statusQuery.isLoading) {
		return <DashboardSkeleton />;
	}

	if (
		!statusQuery.data ||
		!("found" in statusQuery.data) ||
		!statusQuery.data.found
	) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Player not found</CardTitle>
					<CardDescription>
						No data found for &ldquo;{username}&rdquo;. Go back and try a
						different username.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	const { player, isSyncing } = statusQuery.data;
	const gamesData = gamesQuery.data;
	const totalPages = gamesData
		? Math.ceil(gamesData.totalCount / gamesData.pageSize)
		: 0;

	return (
		<div className="space-y-6">
			{/* Player Header */}
			<div className="flex items-center gap-3">
				<h1 className="text-2xl font-bold">{player.username}</h1>
				<Badge variant={isSyncing ? "secondary" : "default"}>
					{isSyncing ? "Syncing..." : "Synced"}
				</Badge>
				{player.lastSyncedAt && (
					<span className="text-sm text-muted-foreground">
						Last synced: {new Date(player.lastSyncedAt).toLocaleString()}
					</span>
				)}
			</div>

			{/* Filters */}
			<div className="flex flex-wrap gap-3">
				<Select
					value={timeControlClass ?? "all"}
					onValueChange={(v) =>
						updateFilter(
							setTimeControlClass,
							v === "all" ? undefined : (v as TimeControlFilter),
						)
					}
				>
					<SelectTrigger className="w-[140px]">
						<SelectValue placeholder="Time Control" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Speeds</SelectItem>
						<SelectItem value="bullet">Bullet</SelectItem>
						<SelectItem value="blitz">Blitz</SelectItem>
						<SelectItem value="rapid">Rapid</SelectItem>
						<SelectItem value="classical">Classical</SelectItem>
						<SelectItem value="daily">Daily</SelectItem>
					</SelectContent>
				</Select>

				<Select
					value={result ?? "all"}
					onValueChange={(v) =>
						updateFilter(
							setResult,
							v === "all" ? undefined : (v as ResultFilter),
						)
					}
				>
					<SelectTrigger className="w-[120px]">
						<SelectValue placeholder="Result" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Results</SelectItem>
						<SelectItem value="win">Wins</SelectItem>
						<SelectItem value="loss">Losses</SelectItem>
						<SelectItem value="draw">Draws</SelectItem>
					</SelectContent>
				</Select>

				<Select
					value={playerColor ?? "all"}
					onValueChange={(v) =>
						updateFilter(
							setPlayerColor,
							v === "all" ? undefined : (v as ColorFilter),
						)
					}
				>
					<SelectTrigger className="w-[120px]">
						<SelectValue placeholder="Color" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Both Colors</SelectItem>
						<SelectItem value="white">White</SelectItem>
						<SelectItem value="black">Black</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Games Table */}
			{gamesQuery.isLoading ? (
				<TableSkeleton />
			) : gamesData && gamesData.games.length > 0 ? (
				<>
					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Date</TableHead>
									<TableHead>Result</TableHead>
									<TableHead>Color</TableHead>
									<TableHead>Opponent</TableHead>
									<TableHead>Rating</TableHead>
									<TableHead>Opening</TableHead>
									<TableHead>Speed</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{gamesData.games.map((game) => (
									<GameRow key={game.id} game={game} />
								))}
							</TableBody>
						</Table>
					</div>

					{/* Pagination */}
					<div className="flex items-center justify-between">
						<span className="text-sm text-muted-foreground">
							{gamesData.totalCount} game
							{gamesData.totalCount !== 1 ? "s" : ""} found
						</span>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={page <= 1}
								onClick={() => setPage((p) => p - 1)}
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
								onClick={() => setPage((p) => p + 1)}
							>
								Next
							</Button>
						</div>
					</div>
				</>
			) : (
				<Card>
					<CardContent className="py-8 text-center text-muted-foreground">
						{isSyncing
							? "Games are being synced. They will appear here shortly..."
							: "No games found matching the selected filters."}
					</CardContent>
				</Card>
			)}
		</div>
	);
}

// ── Game Row ───────────────────────────────────────────────────────────

type GameRowProps = {
	game: {
		id: string;
		playedAt: string;
		resultDetail: string;
		playerColor: string;
		playerRating: number;
		opponentUsername: string;
		opponentRating: number;
		openingName: string | null;
		openingEco: string | null;
		timeControlClass: string;
	};
};

function GameRow({ game }: GameRowProps) {
	let resultCategory: string;
	try {
		resultCategory = classifyResult(game.resultDetail);
	} catch {
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
				<Badge variant={resultVariant}>{resultCategory}</Badge>
			</TableCell>
			<TableCell className="capitalize">{game.playerColor}</TableCell>
			<TableCell>{game.opponentUsername}</TableCell>
			<TableCell>
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

// ── Skeletons ──────────────────────────────────────────────────────────

function DashboardSkeleton() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-8 w-48" />
			<div className="flex gap-3">
				<Skeleton className="h-10 w-[140px]" />
				<Skeleton className="h-10 w-[120px]" />
				<Skeleton className="h-10 w-[120px]" />
			</div>
			<TableSkeleton />
		</div>
	);
}

function TableSkeleton() {
	return (
		<div className="space-y-2">
			<Skeleton className="h-12 w-full" />
			<Skeleton className="h-12 w-full" />
			<Skeleton className="h-12 w-full" />
			<Skeleton className="h-12 w-full" />
			<Skeleton className="h-12 w-full" />
			<Skeleton className="h-12 w-full" />
			<Skeleton className="h-12 w-full" />
			<Skeleton className="h-12 w-full" />
			<Skeleton className="h-12 w-full" />
			<Skeleton className="h-12 w-full" />
		</div>
	);
}

import { Link } from "@tanstack/react-router";
import { Badge } from "#/components/ui/badge";
import { TableCell, TableRow } from "#/components/ui/table";
import { AnalysisStatusBadge } from "#/features/games/components/AnalysisStatusBadge";
import type { Game } from "#/features/games/types";
import { getResultDisplay } from "#/lib/chess-utils";

export function GameRow({ game, username }: { game: Game; username: string }) {
	const result = getResultDisplay(game.resultDetail);

	return (
		<TableRow className="cursor-pointer transition-colors duration-150 hover:bg-muted/50">
			<TableCell className="p-0">
				<Link
					to="/$username/games/$gameId"
					params={{ username, gameId: game.id }}
					className="block whitespace-nowrap px-4 py-2"
				>
					{new Date(game.playedAt).toLocaleDateString()}
				</Link>
			</TableCell>
			<TableCell className="p-0">
				<Link
					to="/$username/games/$gameId"
					params={{ username, gameId: game.id }}
					className="block px-4 py-2"
				>
					<Badge variant={result.variant} className="capitalize">
						{result.label}
					</Badge>
				</Link>
			</TableCell>
			<TableCell className="hidden p-0 sm:table-cell">
				<Link
					to="/$username/games/$gameId"
					params={{ username, gameId: game.id }}
					className="block capitalize px-4 py-2"
				>
					{game.playerColor}
				</Link>
			</TableCell>
			<TableCell className="p-0">
				<Link
					to="/$username/games/$gameId"
					params={{ username, gameId: game.id }}
					className="block px-4 py-2"
				>
					{game.opponentUsername}
				</Link>
			</TableCell>
			<TableCell className="hidden p-0 md:table-cell">
				<Link
					to="/$username/games/$gameId"
					params={{ username, gameId: game.id }}
					className="block text-right tabular-nums px-4 py-2"
				>
					{game.playerRating} vs {game.opponentRating}
				</Link>
			</TableCell>
			<TableCell className="hidden p-0 lg:table-cell">
				<Link
					to="/$username/games/$gameId"
					params={{ username, gameId: game.id }}
					className="block max-w-[200px] truncate px-4 py-2"
					title={game.openingName ?? undefined}
				>
					{game.openingEco && (
						<span className="mr-1 font-mono text-xs text-muted-foreground">
							{game.openingEco}
						</span>
					)}
					{game.openingName ?? (game.openingEco ? null : "Unknown")}
				</Link>
			</TableCell>
			<TableCell className="hidden p-0 sm:table-cell">
				<Link
					to="/$username/games/$gameId"
					params={{ username, gameId: game.id }}
					className="block capitalize px-4 py-2"
				>
					{game.timeControlClass}
				</Link>
			</TableCell>
			<TableCell className="p-0">
				<Link
					to="/$username/games/$gameId"
					params={{ username, gameId: game.id }}
					className="block px-4 py-2"
				>
					<AnalysisStatusBadge status={game.analysisStatus} />
				</Link>
			</TableCell>
		</TableRow>
	);
}

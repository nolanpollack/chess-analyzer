import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { classifyResult } from "#/lib/chess-utils";

type GameDetailHeaderProps = {
	game: {
		opponentUsername: string;
		playerColor: string;
		resultDetail: string;
		playedAt: string;
		openingName?: string | null;
		timeControlClass: string;
	};
	username: string;
};

export function GameDetailHeader({ game, username }: GameDetailHeaderProps) {
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
		<div className="space-y-2">
			<Link
				to="/$username"
				params={{ username }}
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
			>
				<ArrowLeft className="size-4" />
				Back to games
			</Link>
			<div className="flex flex-wrap items-center gap-3">
				<h1 className="text-2xl font-semibold tracking-tight">
					vs {game.opponentUsername}
				</h1>
				<Badge variant={resultVariant} className="capitalize">
					{resultCategory}
				</Badge>
				<span className="text-sm text-muted-foreground capitalize">
					{game.playerColor} · {game.timeControlClass}
				</span>
			</div>
			<p className="text-sm text-muted-foreground">
				{new Date(game.playedAt).toLocaleDateString(undefined, {
					year: "numeric",
					month: "long",
					day: "numeric",
				})}
				{game.openingName && ` · ${game.openingName}`}
			</p>
		</div>
	);
}

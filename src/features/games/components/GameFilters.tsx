import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import type { GameFilters as GameFiltersState } from "#/features/games/types";

type GameFiltersProps = {
	filters: GameFiltersState;
	onUpdate: (update: Partial<Omit<GameFiltersState, "page">>) => void;
};

export function GameFilters({ filters, onUpdate }: GameFiltersProps) {
	return (
		<div className="flex flex-wrap gap-2">
			<Select
				value={filters.timeControlClass ?? "all"}
				onValueChange={(v) =>
					onUpdate({
						timeControlClass:
							v === "all"
								? undefined
								: (v as GameFiltersState["timeControlClass"]),
					})
				}
			>
				<SelectTrigger className="min-w-[140px]">
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
				value={filters.result ?? "all"}
				onValueChange={(v) =>
					onUpdate({
						result: v === "all" ? undefined : (v as GameFiltersState["result"]),
					})
				}
			>
				<SelectTrigger className="min-w-[120px]">
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
				value={filters.playerColor ?? "all"}
				onValueChange={(v) =>
					onUpdate({
						playerColor:
							v === "all" ? undefined : (v as GameFiltersState["playerColor"]),
					})
				}
			>
				<SelectTrigger className="min-w-[120px]">
					<SelectValue placeholder="Color" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">Both Colors</SelectItem>
					<SelectItem value="white">White</SelectItem>
					<SelectItem value="black">Black</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}

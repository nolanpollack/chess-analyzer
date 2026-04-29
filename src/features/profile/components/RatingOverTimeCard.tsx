import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LineChart } from "#/components/charts/LineChart";
import { Segmented } from "#/components/ui/segmented";
import { usePlayerSummary } from "#/features/profile/hooks/use-player-summary";
import {
	getMaiaRatingTrend,
	type MaiaRatingSide,
} from "#/features/profile/server/queries";

type RatingOverTimeCardProps = {
	username: string;
};

const SIDE_OPTIONS: { value: MaiaRatingSide; label: string }[] = [
	{ value: "white", label: "White" },
	{ value: "black", label: "Black" },
];

export function RatingOverTimeCard({ username }: RatingOverTimeCardProps) {
	const [side, setSide] = useState<MaiaRatingSide>("white");
	const { data: summary } = usePlayerSummary(username);
	const playerId = summary?.playerId ?? null;

	const { data: points = [], isLoading } = useQuery({
		queryKey: ["maiaRatingTrend", playerId, side],
		queryFn: async () => {
			if (!playerId) return [];
			const result = await getMaiaRatingTrend({
				data: { playerId, side, limit: 50 },
			});
			if ("error" in result) throw new Error(result.error);
			return result.points;
		},
		enabled: !!playerId,
		placeholderData: keepPreviousData,
	});

	const subtitle = isLoading
		? "Loading…"
		: points.length === 0
			? "No Maia estimates yet"
			: `${side === "white" ? "White" : "Black"} — last ${points.length} games`;

	const chartData = points.map((p) => ({
		label: new Date(p.playedAt).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		}),
		value: p.predicted,
	}));

	return (
		<div className="overflow-hidden rounded-[10px] border border-divider bg-surface">
			<div className="flex items-center justify-between px-5 pt-5">
				<div>
					<div className="text-ui font-medium text-fg-2">Rating over time</div>
					<div className="mt-0.5 text-[11.5px] text-fg-3">{subtitle}</div>
				</div>
				<Segmented options={SIDE_OPTIONS} value={side} onChange={setSide} />
			</div>
			<div className="px-3 pb-3 pt-2">
				{chartData.length >= 2 ? (
					<LineChart data={chartData} className="h-64" />
				) : (
					<div className="flex h-50 items-center justify-center text-xs text-fg-3">
						{isLoading ? "Loading…" : "Not enough games to chart yet."}
					</div>
				)}
			</div>
		</div>
	);
}

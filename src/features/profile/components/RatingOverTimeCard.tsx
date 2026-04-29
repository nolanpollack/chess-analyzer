import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LineChart } from "#/components/charts/LineChart";
import { Segmented } from "#/components/ui/segmented";
import { usePlayerSummary } from "#/features/profile/hooks/use-player-summary";
import {
	getRatingTrend,
	type TrendRange,
} from "#/features/profile/server/queries";

type RatingOverTimeCardProps = {
	username: string;
};

const RANGE_OPTIONS: { value: TrendRange; label: string }[] = [
	{ value: "1m", label: "1M" },
	{ value: "3m", label: "3M" },
	{ value: "6m", label: "6M" },
	{ value: "1y", label: "1Y" },
	{ value: "all", label: "All" },
];

function formatTickLabel(date: Date, range: TrendRange): string {
	if (range === "1m" || range === "3m") {
		return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
	}
	if (range === "6m" || range === "1y") {
		return date.toLocaleDateString("en-US", { month: "short" });
	}
	return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function formatTooltipDate(date: Date): string {
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function RatingOverTimeCard({ username }: RatingOverTimeCardProps) {
	const [range, setRange] = useState<TrendRange>("6m");
	const { data: summary } = usePlayerSummary(username);
	const playerId = summary?.playerId ?? null;

	const { data: points = [], isLoading } = useQuery({
		queryKey: ["ratingTrend", playerId, range],
		queryFn: async () => {
			if (!playerId) return [];
			const result = await getRatingTrend({ data: { playerId, range } });
			if ("error" in result) throw new Error(result.error);
			return result.points;
		},
		enabled: !!playerId,
		placeholderData: keepPreviousData,
	});

	const subtitle = isLoading
		? "Loading…"
		: points.length === 0
			? "No analyzed games in this range"
			: `${points.length} snapshot${points.length === 1 ? "" : "s"}`;

	const chartData = points.map((p) => ({
		label: formatTickLabel(new Date(p.date), range),
		value: p.rating,
		isoDate: p.date,
	}));

	const tooltipLabelFormatter = (label: string): string => {
		const match = chartData.find((d) => d.label === label);
		return match ? formatTooltipDate(new Date(match.isoDate)) : label;
	};

	return (
		<div className="overflow-hidden rounded-[10px] border border-divider bg-surface">
			<div className="flex items-center justify-between px-5 pt-5">
				<div>
					<div className="text-ui font-medium text-fg-2">Rating over time</div>
					<div className="mt-0.5 text-[11.5px] text-fg-3">{subtitle}</div>
				</div>
				<Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />
			</div>
			<div className="px-3 pb-3 pt-2">
				{chartData.length >= 2 ? (
					<LineChart
						data={chartData}
						className="h-64"
						tooltipName="Rating"
						tooltipValueFormatter={(v) => String(Math.round(v))}
						tooltipLabelFormatter={tooltipLabelFormatter}
					/>
				) : (
					<div className="flex h-50 items-center justify-center text-xs text-fg-3">
						{isLoading ? "Loading…" : "Not enough games to chart yet."}
					</div>
				)}
			</div>
		</div>
	);
}

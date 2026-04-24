import { useState } from "react";
import { LineChart } from "#/components/charts/LineChart";
import { Segmented } from "#/components/ui/segmented";
import { useRatingTrend } from "#/features/profile/hooks/use-rating-trend";
import type { TrendRange } from "#/features/profile/server/queries";

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

const RANGE_SUBTITLES: Record<TrendRange, string> = {
	"1m": "Past month",
	"3m": "Past 3 months",
	"6m": "Past 6 months",
	"1y": "Past year",
	all: "All time",
};

const DATE_FORMATS: Record<TrendRange, Intl.DateTimeFormatOptions> = {
	"1m": { month: "short", day: "numeric" },
	"3m": { month: "short", day: "numeric" },
	"6m": { month: "short" },
	"1y": { month: "short", year: "2-digit" },
	all: { month: "short", year: "2-digit" },
};

export function RatingOverTimeCard({ username }: RatingOverTimeCardProps) {
	const [range, setRange] = useState<TrendRange>("6m");
	const { data: weeks = [], isLoading } = useRatingTrend(username, range);

	const subtitle = isLoading
		? "Loading…"
		: weeks.length === 0
			? "No data yet"
			: RANGE_SUBTITLES[range];

	const chartData = weeks.map((w) => ({
		label: new Date(w.weekStart).toLocaleDateString(
			"en-US",
			DATE_FORMATS[range],
		),
		value: w.rating,
	}));

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
				{weeks.length >= 2 ? (
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

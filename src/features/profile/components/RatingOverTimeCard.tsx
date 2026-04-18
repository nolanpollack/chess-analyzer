import { useState } from "react";
import { LineChart } from "#/components/charts/LineChart";
import { Segmented } from "#/components/ui/segmented";
import { useRatingTrend } from "#/features/profile/hooks/use-rating-trend";
import type { RatingPoint } from "#/features/profile/types";
import type { TrendRange } from "#/server/profile";

type RatingOverTimeCardProps = {
	username: string;
};

const RANGE_OPTIONS: { value: TrendRange; label: string }[] = [
	{ value: "4w", label: "4w" },
	{ value: "6m", label: "6m" },
	{ value: "1y", label: "1y" },
	{ value: "all", label: "All" },
];

export function RatingOverTimeCard({ username }: RatingOverTimeCardProps) {
	const [range, setRange] = useState<TrendRange>("6m");
	const { data: weeks = [], isLoading } = useRatingTrend(username, range);

	const subtitle = isLoading
		? "Loading…"
		: weeks.length === 0
			? "No data yet"
			: `Past ${weeks.length} week${weeks.length === 1 ? "" : "s"}`;

	return (
		<div className="overflow-hidden rounded-[10px] border border-divider bg-surface">
			<div className="flex items-center justify-between px-5 pt-5">
				<div>
					<div className="text-[13px] font-medium text-fg-2">
						Rating over time
					</div>
					<div className="mt-[2px] text-[11.5px] text-fg-3">{subtitle}</div>
				</div>
				<Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />
			</div>
			<div className="px-3 pb-3 pt-2">
				{weeks.length >= 2 ? (
					<LineChart
						data={weeks.map((w) => w.rating)}
						w={560}
						h={200}
						color="var(--data-5)"
						xLabels={buildXLabels(weeks)}
					/>
				) : (
					<div className="flex h-[200px] items-center justify-center text-[12px] text-fg-3">
						{isLoading ? "Loading…" : "Not enough games to chart yet."}
					</div>
				)}
			</div>
		</div>
	);
}

function buildXLabels(weeks: RatingPoint[]): string[] {
	if (weeks.length === 0) return [];
	const tickCount = Math.min(6, weeks.length);
	const step = Math.max(1, Math.floor((weeks.length - 1) / (tickCount - 1)));
	const labels: string[] = [];
	for (let i = 0; i < weeks.length; i += step) {
		const date = new Date(weeks[i].weekStart);
		labels.push(date.toLocaleDateString(undefined, { month: "short" }));
		if (labels.length >= tickCount) break;
	}
	return labels;
}

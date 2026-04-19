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

export function RatingOverTimeCard({ username }: RatingOverTimeCardProps) {
	const [range, setRange] = useState<TrendRange>("6m");
	const { data: weeks = [], isLoading } = useRatingTrend(username, range);

	const subtitle = isLoading
		? "Loading…"
		: weeks.length === 0
			? "No data yet"
			: RANGE_SUBTITLES[range];

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
						xTicks={buildXTicks(weeks, range)}
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

function dateFormat(range: TrendRange): Intl.DateTimeFormatOptions {
	if (range === "1m" || range === "3m")
		return { month: "short", day: "numeric" };
	if (range === "1y") return { month: "short", year: "2-digit" };
	if (range === "all") return { month: "short", year: "2-digit" };
	return { month: "short" };
}

function buildXTicks(
	weeks: RatingPoint[],
	range: TrendRange,
): { dataIndex: number; label: string }[] {
	if (weeks.length === 0) return [];
	const tickCount = Math.min(6, weeks.length);
	const fmt = dateFormat(range);
	const indices = pickTickIndices(weeks.length, tickCount);
	const seen = new Set<string>();
	const result: { dataIndex: number; label: string }[] = [];
	for (const i of indices) {
		const label = new Date(weeks[i].weekStart).toLocaleDateString("en-US", fmt);
		if (!seen.has(label)) {
			seen.add(label);
			result.push({ dataIndex: i, label });
		}
	}
	return result;
}

function pickTickIndices(total: number, count: number): number[] {
	if (total <= count) return Array.from({ length: total }, (_, i) => i);
	return Array.from({ length: count }, (_, i) =>
		Math.round((i / (count - 1)) * (total - 1)),
	);
}

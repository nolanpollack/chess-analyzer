import { useMemo, useState } from "react";
import { LineChart } from "#/components/charts/LineChart";
import { MetricDelta } from "#/components/ui/metric";
import { Segmented } from "#/components/ui/segmented";
import { usePlayerSummary } from "#/features/profile/hooks/use-player-summary";
import { useRatingTrend } from "#/features/profile/hooks/use-rating-trend";
import type {
	RatingTrendPoint,
	TrendRange,
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

function formatDateRange(firstIso: string, lastIso: string): string {
	const first = new Date(firstIso);
	const last = new Date(lastIso);
	const multiYear = first.getUTCFullYear() !== last.getUTCFullYear();
	const fmt = (d: Date) =>
		multiYear
			? d.toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
					year: "2-digit",
				})
			: d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
	return `${fmt(first)} – ${fmt(last)}`;
}

const DESIRED_TICKS: Record<TrendRange, number> = {
	"1m": 6,
	"3m": 6,
	"6m": 7,
	"1y": 8,
	all: 8,
};

function isMonthLabelRange(range: TrendRange): boolean {
	return range === "6m" || range === "1y" || range === "all";
}

function formatMonthLabel(date: Date, multiYear: boolean): string {
	return multiYear
		? date.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
		: date.toLocaleDateString("en-US", { month: "short" });
}

function formatDayLabel(date: Date): string {
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTooltipDate(date: Date): string {
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function distinctMonthCount(points: RatingTrendPoint[]): number {
	const set = new Set<string>();
	for (const p of points) {
		const d = new Date(p.date);
		set.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}`);
	}
	return set.size;
}

function pickTickTimestamps(
	points: RatingTrendPoint[],
	range: TrendRange,
): { ticks: number[]; monthMode: boolean } {
	if (points.length === 0) return { ticks: [], monthMode: false };
	const desired = DESIRED_TICKS[range];
	const monthMode = isMonthLabelRange(range) && distinctMonthCount(points) >= 3;

	if (monthMode) {
		const seen = new Set<string>();
		const monthFirsts: number[] = [];
		for (const p of points) {
			const d = new Date(p.date);
			const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
			if (!seen.has(key)) {
				seen.add(key);
				monthFirsts.push(d.getTime());
			}
		}
		if (monthFirsts.length <= desired) return { ticks: monthFirsts, monthMode };
		return { ticks: stridedSample(monthFirsts, desired), monthMode };
	}

	const timestamps = points.map((p) => new Date(p.date).getTime());
	if (timestamps.length <= desired) return { ticks: timestamps, monthMode };
	return { ticks: stridedSample(timestamps, desired), monthMode };
}

function stridedSample<T>(items: T[], count: number): T[] {
	const stride = (items.length - 1) / (count - 1);
	const out: T[] = [];
	for (let i = 0; i < count; i++) {
		const item = items[Math.round(i * stride)];
		if (item !== undefined) out.push(item);
	}
	return out;
}

export function RatingOverTimeCard({ username }: RatingOverTimeCardProps) {
	const [range, setRange] = useState<TrendRange>("1m");
	const { data: summary } = usePlayerSummary(username);
	const playerId = summary?.playerId ?? null;
	const { data, isLoading } = useRatingTrend(playerId, range);

	const points = data?.points ?? [];

	const first = points[0];
	const last = points[points.length - 1];
	const trendDelta = first && last ? last.rating - first.rating : null;
	const dateRange =
		data?.firstGameDate && data?.lastGameDate
			? formatDateRange(data.firstGameDate, data.lastGameDate)
			: null;

	const chartData = useMemo(
		() =>
			points.map((p) => ({ ts: new Date(p.date).getTime(), value: p.rating })),
		[points],
	);

	const { ticks, monthMode } = useMemo(
		() => pickTickTimestamps(points, range),
		[points, range],
	);

	const multiYear = useMemo(() => {
		if (points.length === 0) return false;
		const years = new Set(points.map((p) => new Date(p.date).getUTCFullYear()));
		return years.size > 1;
	}, [points]);

	const xTickFormatter = (value: string | number): string => {
		const d = new Date(typeof value === "number" ? value : Number(value));
		return monthMode ? formatMonthLabel(d, multiYear) : formatDayLabel(d);
	};

	const tooltipLabelFormatter = (value: string | number): string => {
		return formatTooltipDate(
			new Date(typeof value === "number" ? value : Number(value)),
		);
	};

	return (
		<div className="overflow-hidden rounded-lg border border-divider bg-surface">
			<div className="flex items-center justify-between px-5 pt-5">
				<div>
					<div className="text-ui font-medium text-fg-2">Rating over time</div>
					<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
						{isLoading ? (
							<span className="text-[11.5px] text-fg-3">Loading…</span>
						) : trendDelta === null ? (
							<span className="text-[11.5px] text-fg-3">
								No analyzed games in this range
							</span>
						) : (
							<>
								<MetricDelta value={trendDelta} />
								{dateRange && (
									<span className="font-mono text-xs-minus text-fg-4">
										· {dateRange}
									</span>
								)}
							</>
						)}
					</div>
				</div>
				<Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />
			</div>
			<div className="px-3 pb-3 pt-2">
				{chartData.length >= 2 ? (
					<LineChart
						data={chartData}
						className="h-72"
						xDataKey="ts"
						timeAxis
						xTicks={ticks}
						xTickFormatter={xTickFormatter}
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

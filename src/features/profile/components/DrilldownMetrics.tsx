import type { DimensionDrilldownData } from "#/features/profile/types";
import type { DimensionType } from "#/server/profile";

type DrilldownMetricsProps = {
	dimension: DimensionType;
	data: DimensionDrilldownData;
};

export function DrilldownMetrics({ dimension, data }: DrilldownMetricsProps) {
	const accuracyDiff = Math.round(
		data.primary.accuracy - data.primary.overallAccuracy,
	);
	const trendDiff = Math.round(
		data.trend.recentAccuracy - data.trend.olderAccuracy,
	);
	const worstConcept = data.byConcept[0];

	return (
		<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
			<div className="rounded-md bg-muted p-4">
				<p className="text-xs text-muted-foreground">Accuracy</p>
				<p className="text-xl font-medium">{data.primary.accuracy}%</p>
				<p className={`text-xs ${getDiffTextClass(accuracyDiff)}`}>
					{formatSigned(accuracyDiff)}% vs overall
				</p>
			</div>

			<div className="rounded-md bg-muted p-4">
				<p className="text-xs text-muted-foreground">Trend</p>
				<p className="text-xl font-medium">{formatSigned(trendDiff)}%</p>
				<p className={`text-xs ${getTrendTextClass(data.trend.direction)}`}>
					{data.trend.direction}
				</p>
			</div>

			<div className="rounded-md bg-muted p-4">
				<p className="text-xs text-muted-foreground">Worst area</p>
				<p className="text-xl font-medium">
					{worstConcept
						? formatConceptLabel(worstConcept.concept)
						: `No ${dimension} misses`}
				</p>
				<p className="text-xs text-muted-foreground">
					{worstConcept
						? `${worstConcept.missCount} misses`
						: "No explained misses yet"}
				</p>
			</div>
		</div>
	);
}

function formatSigned(value: number): string {
	if (value > 0) return `+${value}`;
	return `${value}`;
}

function getDiffTextClass(diff: number): string {
	if (diff <= -10) return "text-destructive";
	if (diff <= -5) return "text-amber-700 dark:text-amber-300";
	if (diff >= 10) return "text-emerald-700 dark:text-emerald-300";
	return "text-muted-foreground";
}

function getTrendTextClass(
	direction: DimensionDrilldownData["trend"]["direction"],
): string {
	if (direction === "improving")
		return "text-emerald-700 dark:text-emerald-300";
	if (direction === "declining") return "text-destructive";
	return "text-muted-foreground";
}

function formatConceptLabel(concept: string): string {
	return concept
		.split("-")
		.map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
		.join(" ");
}

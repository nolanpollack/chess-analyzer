import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Skeleton } from "#/components/ui/skeleton";
import { DrilldownHeader } from "#/features/profile/components/DrilldownHeader";
import { DrilldownMetrics } from "#/features/profile/components/DrilldownMetrics";
import { ExampleMistakes } from "#/features/profile/components/ExampleMistakes";
import { SubBreakdownCard } from "#/features/profile/components/SubBreakdownCard";
import { useDimensionDrilldown } from "#/features/profile/hooks/use-dimension-drilldown";
import type { DimensionType } from "#/server/profile";

type DimensionDrilldownProps = {
	username: string;
	dimension: DimensionType;
	value: string;
	selectedConcept?: string | null;
	onConceptChange?: (concept: string | null) => void;
};

export function DimensionDrilldown({
	username,
	dimension,
	value,
	selectedConcept,
	onConceptChange,
}: DimensionDrilldownProps) {
	const { data, isLoading } = useDimensionDrilldown(username, dimension, value);
	const [internalSelectedConcept, setInternalSelectedConcept] = useState<
		string | null
	>(null);

	if (isLoading) {
		return <DrilldownSkeleton />;
	}

	if (!data || "error" in data || !data.drilldown) {
		return (
			<div className="space-y-2 py-10 text-center">
				<p className="text-sm font-medium">Could not load drill-down</p>
				<p className="text-sm text-muted-foreground">
					{data && "error" in data ? data.error : "Unexpected error"}
				</p>
			</div>
		);
	}

	const drilldown = data.drilldown;

	if (drilldown.primary.moveCount < 10) {
		return (
			<div className="space-y-4 p-6">
				<DrilldownHeader username={username} data={drilldown} />
				<div className="rounded-lg border border-border bg-card p-6 text-center">
					<p className="text-sm text-muted-foreground">
						Not enough data for a detailed breakdown. Play and analyze more
						games to see insights here.
					</p>
					<Link
						to="/$username/profile"
						params={{ username }}
						className="mt-3 inline-block text-xs text-primary hover:underline"
					>
						Back to profile
					</Link>
				</div>
			</div>
		);
	}

	const conceptNote = getConceptNote(dimension, drilldown.conceptSampleSize);
	const activeSelection = selectedConcept ?? internalSelectedConcept;
	const conceptSelectionValid =
		!activeSelection ||
		drilldown.byConcept.some((concept) => concept.concept === activeSelection);
	const activeConcept = conceptSelectionValid ? activeSelection : null;
	const filteredExamples = activeConcept
		? drilldown.examples.filter((example) =>
				example.concepts.includes(activeConcept ?? ""),
			)
		: drilldown.examples;

	const updateConceptSelection = (concept: string | null) => {
		if (onConceptChange) {
			onConceptChange(concept);
			return;
		}
		setInternalSelectedConcept(concept);
	};

	return (
		<div className="space-y-6 p-6">
			<DrilldownHeader username={username} data={drilldown} />
			<DrilldownMetrics dimension={dimension} data={drilldown} />

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{drilldown.byPiece && (
					<SubBreakdownCard
						title="By piece"
						overallAccuracy={drilldown.primary.overallAccuracy}
						rows={drilldown.byPiece.map((item, idx, all) => ({
							key: item.piece,
							label: capitalize(item.piece),
							accuracy: item.accuracy,
							supportingText: `${item.moveCount} moves`,
							badge: idx === 0 && all.length > 1 ? "weakest" : undefined,
						}))}
					/>
				)}

				{drilldown.byPhase && (
					<SubBreakdownCard
						title="By phase"
						overallAccuracy={drilldown.primary.overallAccuracy}
						rows={drilldown.byPhase.map((item, idx, all) => ({
							key: item.phase,
							label: capitalize(item.phase),
							accuracy: item.accuracy,
							supportingText: `${item.moveCount} moves`,
							badge: idx === 0 && all.length > 1 ? "weakest" : undefined,
						}))}
					/>
				)}

				{drilldown.byOpening && (
					<SubBreakdownCard
						title="After opening"
						overallAccuracy={drilldown.primary.overallAccuracy}
						rows={drilldown.byOpening.map((item, idx, all) => ({
							key: item.eco,
							label: `After ${item.name}`,
							accuracy: item.accuracy,
							supportingText: `${item.gameCount} games`,
							badge: idx === 0 && all.length > 1 ? "weakest" : undefined,
						}))}
					/>
				)}

				<SubBreakdownCard
					title="By concept"
					overallAccuracy={drilldown.primary.overallAccuracy}
					note={conceptNote}
					emptyText="No moves explained in this dimension yet. Explain moves on the game detail page to see concept analysis here."
					selectedKey={activeConcept}
					onConceptRowClick={(conceptKey) =>
						updateConceptSelection(
							activeConcept === conceptKey ? null : conceptKey,
						)
					}
					rows={drilldown.byConcept.map((item) => ({
						key: item.concept,
						label: formatConceptLabel(item.concept),
						missCount: item.missCount,
						totalCount: item.totalCount,
					}))}
					isConcept
				/>
			</div>

			<div className="space-y-2">
				{activeConcept && (
					<div className="text-right">
						<button
							type="button"
							onClick={() => updateConceptSelection(null)}
							className="text-xs text-primary hover:underline"
						>
							Clear filter
						</button>
					</div>
				)}
				<ExampleMistakes
					username={username}
					dimensionLabel={
						activeConcept
							? `${drilldown.primary.label} - ${formatConceptLabel(activeConcept)}`
							: drilldown.primary.label
					}
					examples={filteredExamples}
				/>
			</div>
		</div>
	);
}

function getConceptNote(dimension: DimensionType, sampleSize: number): string {
	const base =
		sampleSize === 0
			? ""
			: `From ${sampleSize} explained ${dimension === "phase" ? "phase" : "dimension"} moves`;

	if (sampleSize === 0) return base;
	if (sampleSize < 20) {
		return `${base} - explain more for better accuracy.`;
	}

	return base;
}

function formatConceptLabel(value: string): string {
	return value
		.split("-")
		.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
		.join(" ");
}

function capitalize(value: string): string {
	if (!value) return value;
	return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function DrilldownSkeleton() {
	return (
		<div className="space-y-6 p-6">
			<div className="space-y-2">
				<Skeleton className="h-4 w-28" />
				<Skeleton className="h-7 w-52" />
				<Skeleton className="h-4 w-80" />
			</div>

			<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
				{[1, 2, 3].map((index) => (
					<div key={index} className="rounded-md bg-muted p-4">
						<Skeleton className="h-3 w-20" />
						<Skeleton className="mt-2 h-6 w-14" />
						<Skeleton className="mt-2 h-3 w-28" />
					</div>
				))}
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{[1, 2, 3, 4].map((index) => (
					<div
						key={index}
						className="rounded-lg border border-border bg-card p-5"
					>
						<Skeleton className="mb-3 h-4 w-24" />
						<div className="space-y-2">
							<Skeleton className="h-6 w-full" />
							<Skeleton className="h-6 w-full" />
							<Skeleton className="h-6 w-full" />
						</div>
					</div>
				))}
			</div>

			<div className="rounded-lg border border-border bg-card p-5">
				<Skeleton className="mb-3 h-4 w-32" />
				<Skeleton className="mb-3 h-3 w-52" />
				<div className="space-y-3">
					<Skeleton className="h-16 w-full" />
					<Skeleton className="h-16 w-full" />
					<Skeleton className="h-16 w-full" />
				</div>
			</div>
		</div>
	);
}

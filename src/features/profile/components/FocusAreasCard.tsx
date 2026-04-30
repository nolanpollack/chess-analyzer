import { ChevronRight, Target } from "lucide-react";
import type { FocusArea } from "#/features/profile/types";
import { usePlayerSummary } from "../hooks/use-player-summary";
import { FocusAreaTile } from "./FocusAreaTile";

// TODO(missing-backend): Focus areas — needs LLM-generated weakness clusters.
// See MISSING_FEATURES.md#focus-areas
type FocusAreasCardProps = {
	username: string;
};

export function FocusAreasCard({ username }: FocusAreasCardProps) {
	const { data: summary } = usePlayerSummary(username);
	const focusAreas: FocusArea[] | null = null as FocusArea[] | null;
	const playerRating = summary?.playerRating ?? null;

	return (
		<div className="overflow-hidden rounded-lg border border-divider bg-surface">
			<div className="flex items-center justify-between border-b border-divider px-6 py-5">
				<div className="flex items-center gap-2.5">
					<Target className="h-4 w-4 text-fg-2" />
					<div>
						<div className="text-sm font-medium text-fg">
							What to work on this week
						</div>
						<div className="mt-0.5 text-xs text-fg-3">
							{playerRating !== null
								? `Your biggest gaps below your overall rating of ${playerRating}`
								: "Your biggest gaps, based on analyzed games"}
						</div>
					</div>
				</div>
				{focusAreas !== null && (
					<button
						type="button"
						className="inline-flex items-center gap-1 rounded-sm border-none bg-transparent px-3 py-1.5 text-ui font-medium text-fg-1 transition-all duration-120 hover:bg-surface-2"
					>
						View all <ChevronRight className="h-icon-sm w-icon-sm" />
					</button>
				)}
			</div>
			{focusAreas === null ? (
				<div className="flex min-h-35 items-center justify-center gap-3 px-6 py-8">
					<Target className="h-4 w-4 shrink-0 text-fg-4" />
					<div>
						<div className="text-ui text-fg-3">Focus areas coming soon</div>
						<div className="mt-0.5 text-xs text-fg-4">
							Personalized weakness clusters will be generated after more games
							are analyzed
						</div>
					</div>
				</div>
			) : (
				<div className="grid grid-cols-3">
					{focusAreas.map((area, i) => (
						<FocusAreaTile
							key={area.id}
							area={area}
							index={i}
							isLast={i === focusAreas.length - 1}
						/>
					))}
				</div>
			)}
		</div>
	);
}

import { createFileRoute } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { PageContainer } from "#/components/layout/PageContainer";
import { Topbar } from "#/components/layout/Topbar";
import { EloEstimateCard } from "#/features/profile/components/EloEstimateCard";
import { FactorBreakdownCard } from "#/features/profile/components/FactorBreakdownCard";
import { FocusAreasCard } from "#/features/profile/components/FocusAreasCard";
import { ProfilePageHeader } from "#/features/profile/components/ProfilePageHeader";
import { RatingOverTimeCard } from "#/features/profile/components/RatingOverTimeCard";
import { RecentGamesCard } from "#/features/profile/components/RecentGamesCard";
import { SyncStatusButton } from "#/features/profile/components/SyncStatusButton";
import { usePlayerSummary } from "#/features/profile/hooks/use-player-summary";
import {
	mockFactors,
	mockFocusAreas,
} from "#/features/profile/mocks/profile-data";

export const Route = createFileRoute("/$username/")({
	component: ProfilePage,
});

function ProfilePage() {
	const { username } = Route.useParams();
	const { data: summary, isLoading } = usePlayerSummary(username);

	return (
		<>
			<Topbar
				crumbs={[{ label: "Profile" }]}
				actions={
					<>
						<SyncStatusButton username={username} />
						<button
							type="button"
							className="inline-flex items-center gap-[6px] rounded-[6px] border-none bg-fg px-3 py-[6px] text-[13px] font-medium text-bg transition-all duration-[120ms]"
						>
							<Play className="h-3 w-3" /> Review last game
						</button>
					</>
				}
			/>
			<PageContainer>
				<ProfilePageHeader eloDelta={summary?.eloDelta30d ?? null} />
				<div className="mb-4 grid grid-cols-[1fr_1.3fr] gap-4">
					<EloEstimateCard summary={summary} isLoading={isLoading} />
					<RatingOverTimeCard username={username} />
				</div>
				<div className="mb-4">
					<FocusAreasCard
						focusAreas={mockFocusAreas}
						playerElo={summary?.eloEstimate ?? null}
					/>
				</div>
				<div className="mb-4">
					<FactorBreakdownCard
						factors={mockFactors}
						playerElo={summary?.eloEstimate ?? null}
					/>
				</div>
				<RecentGamesCard username={username} />
			</PageContainer>
		</>
	);
}

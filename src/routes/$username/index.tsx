import { createFileRoute } from "@tanstack/react-router";
import { PageContainer } from "#/components/layout/PageContainer";
import { Topbar } from "#/components/layout/Topbar";
import { EloEstimateCard } from "#/features/profile/components/EloEstimateCard";
import { FactorBreakdownCard } from "#/features/profile/components/FactorBreakdownCard";
import { FocusAreasCard } from "#/features/profile/components/FocusAreasCard";
import { ProfilePageHeader } from "#/features/profile/components/ProfilePageHeader";
import { RatingOverTimeCard } from "#/features/profile/components/RatingOverTimeCard";
import { RecentGamesCard } from "#/features/profile/components/RecentGamesCard";
import { ReviewLastGameButton } from "#/features/profile/components/ReviewLastGameButton";
import { SyncStatusButton } from "#/features/profile/components/SyncStatusButton";
import { usePlayerSummary } from "#/features/profile/hooks/use-player-summary";

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
						<ReviewLastGameButton username={username} />
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
						focusAreas={null}
						playerElo={summary?.eloEstimate ?? null}
					/>
				</div>
				<div className="mb-4">
					<FactorBreakdownCard
						factors={null}
						playerElo={summary?.eloEstimate ?? null}
					/>
				</div>
				<RecentGamesCard username={username} />
			</PageContainer>
		</>
	);
}

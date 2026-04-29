import { createFileRoute } from "@tanstack/react-router";
import { PageContainer } from "#/components/layout/PageContainer";
import { Topbar } from "#/components/layout/Topbar";
import { useSyncProgress } from "#/features/players/hooks/use-sync-progress";
import { EloEstimateCard } from "#/features/profile/components/EloEstimateCard";
import { FactorBreakdownCard } from "#/features/profile/components/FactorBreakdownCard";
import { FocusAreasCard } from "#/features/profile/components/FocusAreasCard";
import { ProfilePageHeader } from "#/features/profile/components/ProfilePageHeader";
import { RatingOverTimeCard } from "#/features/profile/components/RatingOverTimeCard";
import { RecentGamesCard } from "#/features/profile/components/RecentGamesCard";
import { ReviewLastGameButton } from "#/features/profile/components/ReviewLastGameButton";
import { SyncStatusButton } from "#/features/profile/components/SyncStatusButton";

export const Route = createFileRoute("/$username/")({
	component: ProfilePage,
});

function ProfilePage() {
	const { username } = Route.useParams();
	const syncProgress = useSyncProgress(username);

	return (
		<>
			<Topbar
				crumbs={[{ label: "Profile" }]}
				actions={
					<>
						<SyncStatusButton username={username} progress={syncProgress} />
						<ReviewLastGameButton username={username} />
					</>
				}
			/>
			<PageContainer className="space-y-4">
				<ProfilePageHeader username={username} />
				<div className="grid grid-cols-[1fr_1.3fr] gap-4">
					<EloEstimateCard username={username} />
					<RatingOverTimeCard username={username} />
				</div>
				<FocusAreasCard username={username} />
				<FactorBreakdownCard username={username} />
				<RecentGamesCard username={username} />
			</PageContainer>
		</>
	);
}

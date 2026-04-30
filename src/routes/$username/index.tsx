import { createFileRoute } from "@tanstack/react-router";
import { PageContainer } from "#/components/layout/PageContainer";
import { Topbar } from "#/components/layout/Topbar";
import { useProfileProgress } from "#/features/players/hooks/use-profile-progress";
import { FactorBreakdownCard } from "#/features/profile/components/FactorBreakdownCard";
import { FocusAreasCard } from "#/features/profile/components/FocusAreasCard";
import { PlayerRatingCard } from "#/features/profile/components/PlayerRatingCard";
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
	const progress = useProfileProgress(username);
	const isAnalyzing = progress?.state === "analyzing";

	return (
		<>
			<Topbar
				crumbs={[{ label: "Profile" }]}
				actions={
					<>
						<SyncStatusButton username={username} progress={progress} />
						<ReviewLastGameButton username={username} />
					</>
				}
			/>
			<PageContainer className="space-y-4">
				<ProfilePageHeader username={username} />
				<div
					className="grid gap-4"
					style={{ gridTemplateColumns: "1fr 1.3fr" }}
				>
					<PlayerRatingCard username={username} isAnalyzing={isAnalyzing} />
					<RatingOverTimeCard username={username} />
				</div>
				<FocusAreasCard username={username} />
				<FactorBreakdownCard username={username} isAnalyzing={isAnalyzing} />
				<RecentGamesCard username={username} />
			</PageContainer>
		</>
	);
}

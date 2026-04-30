import { PageHeader } from "#/components/layout/PageHeader";
import { usePlayerSummary } from "../hooks/use-player-summary";

export function ProfilePageHeader({ username }: { username: string }) {
	const { data: summary } = usePlayerSummary(username);
	const ratingDelta = summary?.playerRatingDelta30d;

	const subtitle = getGreetingSubtitle(ratingDelta);

	return <PageHeader title="Your chess, at a glance" subtitle={subtitle} />;
}

function getGreetingSubtitle(ratingDelta: number | null | undefined): string {
	if (ratingDelta == null) return "Your recent performance and trends.";
	if (ratingDelta > 0)
		return `You climbed ${ratingDelta} points this month — keep it up.`;
	if (ratingDelta < 0)
		return `You're down ${Math.abs(ratingDelta)} points this month — let's find the leaks.`;
	return "Steady month — time to break through?";
}

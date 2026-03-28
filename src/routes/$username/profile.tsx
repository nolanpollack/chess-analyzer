import { createFileRoute, Link } from "@tanstack/react-router";
import { PlayerProfileView } from "#/features/profile/components/PlayerProfileView";
import { ProfileSkeleton } from "#/features/profile/components/ProfileSkeleton";
import {
	usePlayerProfile,
	useRefreshProfile,
} from "#/features/profile/hooks/use-player-profile";

export const Route = createFileRoute("/$username/profile")({
	component: ProfilePage,
});

function ProfilePage() {
	const { username } = Route.useParams();
	const { data, isLoading } = usePlayerProfile(username);
	const refresh = useRefreshProfile(username);

	if (isLoading) return <ProfileSkeleton />;

	if (!data || "error" in data) {
		return (
			<div className="py-12 text-center">
				<p className="text-sm font-medium">Could not load profile</p>
				<p className="mt-1 text-sm text-muted-foreground">
					{data && "error" in data
						? data.error
						: "An unexpected error occurred."}
				</p>
			</div>
		);
	}

	if (!data.profile) {
		return (
			<div className="py-12 text-center">
				<p className="text-sm font-medium">No analyzed games yet</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Analyze at least a few games to see your profile.
				</p>
				<Link
					to="/$username"
					params={{ username }}
					className="mt-4 inline-block text-sm text-primary hover:underline"
				>
					Go to games
				</Link>
			</div>
		);
	}

	return (
		<PlayerProfileView
			username={username}
			profile={data.profile}
			onRefresh={() => refresh.mutate()}
			isRefreshing={refresh.isPending}
		/>
	);
}

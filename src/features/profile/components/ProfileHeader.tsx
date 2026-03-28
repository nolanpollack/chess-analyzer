import { AccuracyBar } from "#/components/AccuracyBar";
import type { PlayerProfileData } from "#/features/profile/types";

type Props = {
	username: string;
	profile: PlayerProfileData;
	onRefresh: () => void;
	isRefreshing: boolean;
};

export function ProfileHeader({
	username,
	profile,
	onRefresh,
	isRefreshing,
}: Props) {
	return (
		<div className="flex items-start justify-between">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">{username}</h1>
				<p className="mt-1 text-xs text-muted-foreground">
					{profile.gamesAnalyzed}{" "}
					{profile.gamesAnalyzed === 1 ? "game" : "games"} analyzed &middot;{" "}
					{profile.totalMovesAnalyzed} moves
				</p>
			</div>
			<div className="flex items-center gap-3">
				<p className="text-xs text-muted-foreground">
					Updated {formatRelativeTime(profile.computedAt)}
				</p>
				<button
					type="button"
					className="text-xs text-primary hover:underline disabled:opacity-50"
					onClick={onRefresh}
					disabled={isRefreshing}
				>
					{isRefreshing ? "Refreshing..." : "Refresh"}
				</button>
			</div>
		</div>
	);
}

export function ProfileMetricCards({
	profile,
}: {
	profile: PlayerProfileData;
}) {
	const trend =
		profile.recentAccuracy !== null && profile.olderAccuracy !== null
			? profile.recentAccuracy - profile.olderAccuracy
			: null;

	return (
		<div className="grid grid-cols-3 gap-6">
			<div>
				<p className="text-xs text-muted-foreground">Overall accuracy</p>
				<div className="flex items-baseline gap-2">
					<span className="text-xl font-medium">
						{profile.overallAccuracy}%
					</span>
					{trend !== null && <TrendBadge diff={trend} />}
				</div>
				<AccuracyBar accuracy={profile.overallAccuracy} diff={0} />
			</div>
			<MetricItem
				label="Avg centipawn loss"
				value={`${profile.overallAvgCpLoss}`}
				sublabel="per move"
			/>
			<MetricItem
				label="Moves explained"
				value={`${profile.totalExplainedMoves}`}
				sublabel={`across ${profile.gamesAnalyzed} ${profile.gamesAnalyzed === 1 ? "game" : "games"}`}
			/>
		</div>
	);
}

function MetricItem({
	label,
	value,
	sublabel,
}: {
	label: string;
	value: React.ReactNode;
	sublabel?: string;
}) {
	return (
		<div>
			<p className="text-xs text-muted-foreground">{label}</p>
			<span className="text-xl font-medium">{value}</span>
			{sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
		</div>
	);
}

function TrendBadge({ diff }: { diff: number }) {
	if (Math.abs(diff) < 1) return null;

	const isPositive = diff > 0;
	const colorClass = isPositive
		? "text-emerald-700 dark:text-emerald-300"
		: "text-red-700 dark:text-red-300";

	return (
		<span className={`text-xs ${colorClass}`}>
			{isPositive ? "+" : ""}
			{Math.round(diff)}% vs prior
		</span>
	);
}

function formatRelativeTime(isoDate: string): string {
	const diff = Date.now() - new Date(isoDate).getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

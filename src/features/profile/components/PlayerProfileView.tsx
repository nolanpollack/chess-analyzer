import { Link } from "@tanstack/react-router";
import { DIMENSION_LABELS } from "#/config/concepts";
import type { CategoryStats, OpeningStats, PieceStats } from "#/db/schema";
import { AccuracyTrendChart } from "#/features/profile/components/AccuracyTrendChart";
import { DimensionCard } from "#/features/profile/components/DimensionCard";
import {
	ProfileHeader,
	ProfileMetricCards,
} from "#/features/profile/components/ProfileHeader";
import { WeaknessPanel } from "#/features/profile/components/WeaknessPanel";
import type { PlayerProfileData } from "#/features/profile/types";

type Props = {
	username: string;
	profile: PlayerProfileData;
	onRefresh: () => void;
	isRefreshing: boolean;
};

export function PlayerProfileView({
	username,
	profile,
	onRefresh,
	isRefreshing,
}: Props) {
	const cards = buildCardList(profile, username);

	return (
		<div className="space-y-6 p-6">
			<ProfileHeader
				username={username}
				profile={profile}
				onRefresh={onRefresh}
				isRefreshing={isRefreshing}
			/>

			<ProfileMetricCards profile={profile} />

			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">{cards}</div>

			<WeaknessPanel
				username={username}
				weaknesses={profile.weaknesses ?? []}
				recommendations={profile.studyRecommendations ?? []}
			/>

			<AccuracyTrendChart
				username={username}
				overallAccuracy={profile.overallAccuracy}
			/>

			<div className="text-center">
				<Link
					to="/$username"
					params={{ username }}
					className="text-xs text-primary hover:underline"
				>
					&larr; Back to games
				</Link>
			</div>
		</div>
	);
}

function buildCardList(profile: PlayerProfileData, username: string) {
	const cards: React.ReactNode[] = [];

	cards.push(<PhaseCard key="phase" profile={profile} username={username} />);
	cards.push(
		<PieceCard
			key="piece"
			username={username}
			pieceStats={profile.pieceStats}
			overallAccuracy={profile.overallAccuracy}
		/>,
	);

	if (profile.categoryStats && Object.keys(profile.categoryStats).length > 0) {
		cards.push(
			<CategoryCard
				key="category"
				username={username}
				categoryStats={profile.categoryStats}
				overallAccuracy={profile.overallAccuracy}
			/>,
		);
	}

	const openingEntries = Object.entries(profile.openingStats);
	if (openingEntries.length > 0) {
		cards.push(
			<OpeningCard
				key="opening"
				username={username}
				openingStats={profile.openingStats}
				overallAccuracy={profile.overallAccuracy}
			/>,
		);
	}

	return cards;
}

function PhaseCard({
	profile,
	username,
}: {
	profile: PlayerProfileData;
	username: string;
}) {
	const rows = buildPhaseRows(profile, username);
	return (
		<DimensionCard
			title="By phase"
			rows={rows}
			overallAccuracy={profile.overallAccuracy}
		/>
	);
}

function buildPhaseRows(profile: PlayerProfileData, username: string) {
	const phases: { key: string; label: string; accuracy: number | null }[] = [
		{ key: "opening", label: "Opening", accuracy: profile.openingAccuracy },
		{
			key: "middlegame",
			label: "Middlegame",
			accuracy: profile.middlegameAccuracy,
		},
		{ key: "endgame", label: "Endgame", accuracy: profile.endgameAccuracy },
	];

	return phases.map((phase) => ({
		key: phase.key,
		label: phase.label,
		accuracy: phase.accuracy ?? 0,
		moveCount: 0,
		extra: phase.accuracy === null ? "N/A" : undefined,
		href: `/${username}/profile/phase/${phase.key}`,
	}));
}

function PieceCard({
	username,
	pieceStats,
	overallAccuracy,
}: {
	username: string;
	pieceStats: PieceStats;
	overallAccuracy: number;
}) {
	const rows = buildPieceRows(pieceStats, username);
	return (
		<DimensionCard
			title="By piece"
			rows={rows}
			overallAccuracy={overallAccuracy}
		/>
	);
}

function buildPieceRows(pieceStats: PieceStats, username: string) {
	const pieces = ["pawn", "knight", "bishop", "rook", "queen", "king"] as const;
	return pieces
		.filter((piece) => pieceStats[piece].moveCount > 0)
		.map((piece) => ({
			key: piece,
			label: piece.charAt(0).toUpperCase() + piece.slice(1),
			accuracy: pieceStats[piece].accuracy,
			moveCount: pieceStats[piece].moveCount,
			extra: pluralize(pieceStats[piece].moveCount, "move"),
			href: `/${username}/profile/piece/${piece}`,
		}));
}

function CategoryCard({
	username,
	categoryStats,
	overallAccuracy,
}: {
	username: string;
	categoryStats: CategoryStats | null;
	overallAccuracy: number;
}) {
	if (!categoryStats || Object.keys(categoryStats).length === 0) return null;

	const rows = Object.entries(categoryStats).map(([key, stats]) => ({
		key,
		label: DIMENSION_LABELS[key as keyof typeof DIMENSION_LABELS] ?? key,
		accuracy: stats.accuracy,
		moveCount: stats.moveCount,
		extra: pluralize(stats.moveCount, "move"),
		href: `/${username}/profile/category/${key}`,
	}));

	return (
		<DimensionCard
			title="By concept category"
			rows={rows}
			overallAccuracy={overallAccuracy}
			note="Based on explained moves"
		/>
	);
}

function OpeningCard({
	username,
	openingStats,
	overallAccuracy,
}: {
	username: string;
	openingStats: OpeningStats;
	overallAccuracy: number;
}) {
	const entries = Object.entries(openingStats);
	if (entries.length === 0) return null;

	const rows = entries
		.sort(([, a], [, b]) => b.gameCount - a.gameCount)
		.map(([eco, stats]) => ({
			key: eco,
			label: stats.name,
			accuracy: stats.accuracy,
			moveCount: stats.moveCount,
			extra: pluralize(stats.gameCount, "game"),
			href: `/${username}/profile/opening/${eco}`,
		}));

	return (
		<DimensionCard
			title="By opening"
			rows={rows}
			overallAccuracy={overallAccuracy}
		/>
	);
}

function pluralize(count: number, word: string): string {
	return `${count} ${count === 1 ? word : `${word}s`}`;
}

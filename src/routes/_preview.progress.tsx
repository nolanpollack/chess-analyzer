import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageContainer } from "#/components/layout/PageContainer";
import { Topbar } from "#/components/layout/Topbar";
import {
	type AnalysisProgress,
	GameTableRow,
} from "#/features/games/components/GameTableRow";
import type { GameSummary } from "#/features/games/types";
import type { ProfileProgress } from "#/features/players/hooks/use-profile-progress";
import { SyncStatusButton } from "#/features/profile/components/SyncStatusButton";

export const Route = createFileRoute("/_preview/progress")({
	component: ProgressPreviewPage,
});

const TABLE_HEADERS = [
	"Result",
	"Opponent",
	"Opening",
	"Time",
	"Accuracy",
	"Game rating",
	"Played",
];

type RowFixture = {
	game: GameSummary;
	analysis?: AnalysisProgress;
};

const ROW_FIXTURES: RowFixture[] = [
	{
		game: makeGame({
			id: "g-complete",
			opp: "magnusbot",
			oppElo: 1840,
			result: "W",
			color: "white",
			rating: 1620,
			acc: 92.4,
			when: "2h ago",
		}),
	},
	{
		game: makeGame({
			id: "g-pending",
			opp: "queenslayer",
			oppElo: 1510,
			result: "L",
			color: "black",
			rating: null,
			acc: null,
			when: "12m ago",
		}),
		analysis: {
			status: "pending",
			movesAnalyzed: 0,
			totalMoves: 64,
			accuracyReady: false,
			gameRatingReady: false,
		},
	},
	{
		game: makeGame({
			id: "g-early",
			opp: "rookmaster",
			oppElo: 1605,
			result: "W",
			color: "white",
			rating: null,
			acc: null,
			when: "8m ago",
		}),
		analysis: {
			status: "in-progress",
			movesAnalyzed: 12,
			totalMoves: 80,
			accuracyReady: false,
			gameRatingReady: false,
		},
	},
	{
		game: makeGame({
			id: "g-acc-only",
			opp: "knightowl",
			oppElo: 1720,
			result: "D",
			color: "black",
			rating: null,
			acc: 78.1,
			when: "4m ago",
		}),
		analysis: {
			status: "in-progress",
			movesAnalyzed: 64,
			totalMoves: 64,
			accuracyReady: true,
			gameRatingReady: false,
		},
	},
	{
		game: makeGame({
			id: "g-failed",
			opp: "pawnstar",
			oppElo: 1480,
			result: "L",
			color: "white",
			rating: null,
			acc: null,
			when: "yesterday",
		}),
		analysis: {
			status: "failed",
			movesAnalyzed: 12,
			totalMoves: 64,
			accuracyReady: false,
			gameRatingReady: false,
		},
	},
];

type SyncState = "idle" | "syncing" | "analyzing-light" | "analyzing-deep";

const SYNC_STATES: SyncState[] = [
	"idle",
	"syncing",
	"analyzing-light",
	"analyzing-deep",
];

function ProgressPreviewPage() {
	const [syncState, setSyncState] = useState<SyncState>("analyzing-light");
	const progress = progressFixture(syncState);

	return (
		<>
			<Topbar crumbs={[{ label: "Preview" }, { label: "Progress" }]} />
			<PageContainer className="space-y-8">
				<section className="space-y-3">
					<header className="space-y-1">
						<h2 className="text-lg font-medium">Game analysis progress</h2>
						<p className="text-sm text-fg-3">
							Per-cell loading on the Accuracy and Game rating columns — em-dash
							for queued, indeterminate shimmer for game-rating, a determinate
							bar for accuracy as moves complete.
						</p>
					</header>
					<MockGamesTable rows={ROW_FIXTURES} />
				</section>

				<section className="space-y-3">
					<header className="space-y-1">
						<h2 className="text-lg font-medium">Topbar status pill</h2>
						<p className="text-sm text-fg-3">
							Single pill, three states. Hover the pill to reveal the per-stage
							breakdown popover.
						</p>
					</header>
					<StateSwitcher
						value={syncState}
						options={SYNC_STATES}
						onChange={setSyncState}
					/>
					<TopbarFragment>
						<SyncStatusButton username="preview" progress={progress} />
					</TopbarFragment>
				</section>
			</PageContainer>
		</>
	);
}

function MockGamesTable({ rows }: { rows: RowFixture[] }) {
	return (
		<div className="overflow-hidden rounded-lg border border-divider bg-surface">
			<table className="w-full border-collapse text-ui">
				<thead>
					<tr>
						{TABLE_HEADERS.map((header, i) => (
							<th
								key={header}
								className={`border-b border-divider py-2.5 text-xs-minus font-medium uppercase tracking-label text-fg-3 ${
									i === 0
										? "pl-5 pr-3 text-left"
										: i === 6
											? "pl-3 pr-5 text-right"
											: i >= 4
												? "px-3 text-right"
												: "px-3 text-left"
								}`}
							>
								{header}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<GameTableRow
							key={row.game.id}
							game={row.game}
							username="preview"
							analysis={row.analysis}
						/>
					))}
				</tbody>
			</table>
			<div className="border-t border-divider px-5 py-2 text-2xs text-fg-3">
				One row per analysis state. Hover/click navigates as in production.
			</div>
		</div>
	);
}

function TopbarFragment({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex items-center justify-end rounded-lg border border-divider bg-topbar-bg px-4 py-2">
			{children}
		</div>
	);
}

function StateSwitcher<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T;
	options: readonly T[];
	onChange: (next: T) => void;
}) {
	return (
		<div className="flex flex-wrap gap-1 rounded-md border bg-surface p-1">
			{options.map((opt) => {
				const active = opt === value;
				return (
					<button
						key={opt}
						type="button"
						onClick={() => onChange(opt)}
						className={`rounded-sm px-3 py-1 text-xs font-medium transition-colors duration-150 ${
							active
								? "bg-surface-3 text-fg-1"
								: "text-fg-3 hover:bg-surface-2 hover:text-fg-2"
						}`}
					>
						{opt}
					</button>
				);
			})}
		</div>
	);
}

function makeGame(
	overrides: Partial<GameSummary> & { id: string },
): GameSummary {
	return {
		id: overrides.id,
		opp: overrides.opp ?? "opponent",
		oppElo: overrides.oppElo ?? 1500,
		result: overrides.result ?? "W",
		color: overrides.color ?? "white",
		rating: overrides.rating ?? null,
		acc: overrides.acc ?? null,
		time: overrides.time ?? "10+0",
		opening: overrides.opening ?? "Italian Game",
		when: overrides.when ?? "just now",
	};
}

function progressFixture(state: SyncState): ProfileProgress {
	switch (state) {
		case "idle":
			return {
				state: "idle",
				isSyncing: false,
				lastSyncedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
				imported: 50,
				totalGamesToImport: 50,
				accuracy: 50,
				gameRating: 50,
				patterns: 50,
				positionsAnalyzed: 2400,
			};
		case "syncing":
			return {
				state: "syncing",
				isSyncing: true,
				lastSyncedAt: null,
				imported: 12,
				totalGamesToImport: 84,
				accuracy: 0,
				gameRating: 0,
				patterns: 0,
				positionsAnalyzed: 0,
			};
		case "analyzing-light":
			return {
				state: "analyzing",
				isSyncing: false,
				lastSyncedAt: new Date(Date.now() - 60_000).toISOString(),
				imported: 42,
				totalGamesToImport: 0,
				accuracy: 38,
				gameRating: 21,
				patterns: 12,
				positionsAnalyzed: 1900,
			};
		case "analyzing-deep":
			return {
				state: "analyzing",
				isSyncing: false,
				lastSyncedAt: new Date(Date.now() - 30_000).toISOString(),
				imported: 200,
				totalGamesToImport: 0,
				accuracy: 80,
				gameRating: 30,
				patterns: 28,
				positionsAnalyzed: 4200,
			};
	}
}

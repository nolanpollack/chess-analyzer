import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageContainer } from "#/components/layout/PageContainer";
import { Topbar } from "#/components/layout/Topbar";
import type { GameSummary } from "#/features/games/types";
import {
	type AnalysisProgress,
	RecentGameRow,
} from "#/features/profile/components/RecentGameRow";
import {
	type SyncProgress,
	SyncStatusButton,
} from "#/features/profile/components/SyncStatusButton";

export const Route = createFileRoute("/_preview/progress")({
	component: ProgressPreviewPage,
});

const TABLE_HEADERS = [
	"Result",
	"Opponent",
	"Opening",
	"Time",
	"Accuracy",
	"Game score",
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
			score: 1620,
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
			score: null,
			acc: null,
			when: "12m ago",
		}),
		analysis: { status: "pending", movesAnalyzed: 0, totalMoves: 64 },
	},
	{
		game: makeGame({
			id: "g-early",
			opp: "rookmaster",
			oppElo: 1605,
			result: "W",
			color: "white",
			score: null,
			acc: null,
			when: "8m ago",
		}),
		analysis: { status: "in-progress", movesAnalyzed: 12, totalMoves: 80 },
	},
	{
		game: makeGame({
			id: "g-late",
			opp: "knightowl",
			oppElo: 1720,
			result: "D",
			color: "black",
			score: null,
			acc: null,
			when: "4m ago",
		}),
		analysis: { status: "in-progress", movesAnalyzed: 58, totalMoves: 64 },
	},
	{
		game: makeGame({
			id: "g-failed",
			opp: "pawnstar",
			oppElo: 1480,
			result: "L",
			color: "white",
			score: null,
			acc: null,
			when: "yesterday",
		}),
		analysis: { status: "failed", movesAnalyzed: 12, totalMoves: 64 },
	},
];

type SyncState =
	| "idle"
	| "syncing-unknown-total"
	| "syncing-imported-only"
	| "syncing-and-analyzing"
	| "complete"
	| "failed";

const SYNC_STATES: SyncState[] = [
	"idle",
	"syncing-unknown-total",
	"syncing-imported-only",
	"syncing-and-analyzing",
	"complete",
	"failed",
];

function ProgressPreviewPage() {
	const [syncState, setSyncState] = useState<SyncState>(
		"syncing-and-analyzing",
	);
	const syncProgress = syncFixture(syncState);

	return (
		<>
			<Topbar crumbs={[{ label: "Preview" }, { label: "Progress" }]} />
			<PageContainer className="space-y-8">
				<section className="space-y-3">
					<header className="space-y-1">
						<h2 className="text-lg font-medium">Game analysis progress</h2>
						<p className="text-sm text-fg-3">
							Inline within the recent-games table. The accuracy cell switches
							to a progress indicator while the game is being analyzed.
						</p>
					</header>
					<MockGamesTable rows={ROW_FIXTURES} />
				</section>

				<section className="space-y-3">
					<header className="space-y-1">
						<h2 className="text-lg font-medium">Profile sync progress</h2>
						<p className="text-sm text-fg-3">
							The topbar sync button surfaces progress inline — a thin strip
							under the label and an inline count.
						</p>
					</header>
					<StateSwitcher
						value={syncState}
						options={SYNC_STATES}
						onChange={setSyncState}
					/>
					<TopbarFragment>
						<SyncStatusButton username="preview" progress={syncProgress} />
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
								className={`border-b border-divider py-2.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-fg-3 ${
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
						<RecentGameRow
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
		score: overrides.score ?? null,
		acc: overrides.acc ?? null,
		time: overrides.time ?? "10+0",
		opening: overrides.opening ?? "Italian Game",
		when: overrides.when ?? "just now",
	};
}

function syncFixture(state: SyncState): SyncProgress | undefined {
	switch (state) {
		case "idle":
			return undefined;
		case "syncing-unknown-total":
			return {
				status: "syncing",
				gamesImported: 8,
				totalGamesToImport: 0,
				gamesAnalyzed: 0,
			};
		case "syncing-imported-only":
			return {
				status: "syncing",
				gamesImported: 8,
				totalGamesToImport: 50,
				gamesAnalyzed: 0,
			};
		case "syncing-and-analyzing":
			return {
				status: "syncing",
				gamesImported: 32,
				totalGamesToImport: 50,
				gamesAnalyzed: 14,
			};
		case "complete":
			return {
				status: "complete",
				gamesImported: 50,
				totalGamesToImport: 50,
				gamesAnalyzed: 50,
			};
		case "failed":
			return {
				status: "failed",
				gamesImported: 8,
				totalGamesToImport: 50,
				gamesAnalyzed: 3,
			};
	}
}

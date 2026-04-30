import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { PageContainer } from "#/components/layout/PageContainer";
import { Topbar } from "#/components/layout/Topbar";
import { GamesFilterBar } from "#/features/games/components/GamesFilterBar";
import { GamesStatsPanel } from "#/features/games/components/GamesStatsPanel";
import { GamesTable } from "#/features/games/components/GamesTable";
import type { AnalysisProgress } from "#/features/games/components/GameTableRow";
import { GAMES_COLUMNS } from "#/features/games/components/game-columns";
import { useGameAnalysisStatuses } from "#/features/games/hooks/use-game-analysis-statuses";
import {
	type GamesQueryFilters,
	type GamesSort,
	useGames,
} from "#/features/games/hooks/use-games";
import { useProfileProgress } from "#/features/players/hooks/use-profile-progress";
import { SyncStatusButton } from "#/features/profile/components/SyncStatusButton";
import { usePlayerSummary } from "#/features/profile/hooks/use-player-summary";

export const Route = createFileRoute("/$username/games/")({
	component: GamesPage,
});

const PAGE_SIZE = 50;

function GamesPage() {
	const { username } = Route.useParams();
	const progress = useProfileProgress(username);
	const { data: summary } = usePlayerSummary(username);
	const playerRating = summary?.playerRating ?? null;
	const [filters, setFilters] = useState<GamesQueryFilters>({});
	const [sort, setSort] = useState<GamesSort>({ key: "date", dir: "desc" });
	const [page, setPage] = useState(1);

	const updateFilters = (next: GamesQueryFilters) => {
		setFilters(next);
		setPage(1);
	};
	const updateSort = (next: GamesSort) => {
		setSort(next);
		setPage(1);
	};

	const { data, isLoading } = useGames({
		username,
		filters,
		sort,
		page,
		pageSize: PAGE_SIZE,
	});

	const items = data?.items ?? [];
	const rawItems = data?.rawItems ?? [];
	const totalCount = data?.totalCount ?? 0;
	const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
	const hasActiveFilters = Object.values(filters).some(
		(v) => v !== undefined && v !== "",
	);

	const gameIds = items.map((g) => g.id);
	const { statusById } = useGameAnalysisStatuses(gameIds);

	const analysisById = useMemo(() => {
		const map = new Map<string, AnalysisProgress>();
		for (const summary of items) {
			const status = statusById.get(summary.id);
			const raw = rawItems.find((r) => r.id === summary.id);
			if (status) {
				map.set(summary.id, {
					status: status.status,
					movesAnalyzed: status.movesAnalyzed,
					totalMoves: status.totalMoves ?? 0,
					accuracyReady: status.accuracyReady,
					gameRatingReady: status.gameRatingReady,
				});
			} else if (raw && raw.overallAccuracy === null) {
				map.set(summary.id, {
					status: "pending",
					movesAnalyzed: 0,
					totalMoves: 0,
					accuracyReady: false,
					gameRatingReady: false,
				});
			}
		}
		return map;
	}, [items, rawItems, statusById]);

	return (
		<>
			<Topbar
				crumbs={[
					{ label: "Profile", to: { to: "/$username", params: { username } } },
					{ label: "Games" },
				]}
				actions={<SyncStatusButton username={username} progress={progress} />}
			/>
			<PageContainer className="space-y-6">
				<header>
					<h1 className="text-2xl font-semibold tracking-tight text-fg">
						Games
					</h1>
					<p className="mt-2 max-w-2xl text-ui text-fg-3">
						{totalCount.toLocaleString()} games imported from your connected
						accounts. Filter, sort, and click any game to analyze.
					</p>
				</header>

				<GamesStatsPanel
					username={username}
					filters={filters}
					hasActiveFilters={hasActiveFilters}
				/>

				<div>
					<GamesFilterBar filters={filters} onChange={updateFilters} />

					<div className="overflow-hidden rounded-lg border border-divider bg-surface">
						<GamesTable
							data={items}
							columns={GAMES_COLUMNS}
							username={username}
							sort={sort}
							onSortChange={updateSort}
							analysisById={analysisById}
							isLoading={isLoading && items.length === 0}
							playerRating={playerRating}
							emptyState={
								<EmptyState
									hasActiveFilters={hasActiveFilters}
									onClear={() => updateFilters({})}
								/>
							}
						/>

						{totalCount > 0 && (
							<PaginationFooter
								page={page}
								totalPages={totalPages}
								totalCount={totalCount}
								pageSize={PAGE_SIZE}
								onPrev={() => setPage((p) => Math.max(1, p - 1))}
								onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
							/>
						)}
					</div>
				</div>
			</PageContainer>
		</>
	);
}

function EmptyState({
	hasActiveFilters,
	onClear,
}: {
	hasActiveFilters: boolean;
	onClear: () => void;
}) {
	return (
		<div className="flex flex-col items-center gap-3 py-16">
			<div className="text-base font-medium text-fg">
				{hasActiveFilters ? "No games match these filters" : "No games yet"}
			</div>
			{hasActiveFilters && (
				<>
					<p className="max-w-sm text-center text-ui text-fg-3">
						Try removing a filter or broadening the search.
					</p>
					<button
						type="button"
						onClick={onClear}
						className="mt-2 rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg-1 hover:bg-surface-3"
					>
						Clear all filters
					</button>
				</>
			)}
		</div>
	);
}

function PaginationFooter({
	page,
	totalPages,
	totalCount,
	pageSize,
	onPrev,
	onNext,
}: {
	page: number;
	totalPages: number;
	totalCount: number;
	pageSize: number;
	onPrev: () => void;
	onNext: () => void;
}) {
	const start = (page - 1) * pageSize + 1;
	const end = Math.min(page * pageSize, totalCount);
	return (
		<div className="flex items-center justify-between border-t border-divider px-5 py-3 text-xs text-fg-3">
			<span>
				<span className="mono-nums font-mono">
					{start.toLocaleString()}–{end.toLocaleString()}
				</span>{" "}
				of{" "}
				<span className="mono-nums font-mono">
					{totalCount.toLocaleString()}
				</span>
			</span>
			<div className="flex items-center gap-1">
				<button
					type="button"
					onClick={onPrev}
					disabled={page <= 1}
					className="inline-flex items-center gap-1 rounded-sm px-2 py-1 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
				>
					<ChevronLeft className="size-3" /> Prev
				</button>
				<span className="mono-nums font-mono px-2">
					{page} / {totalPages}
				</span>
				<button
					type="button"
					onClick={onNext}
					disabled={page >= totalPages}
					className="inline-flex items-center gap-1 rounded-sm px-2 py-1 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
				>
					Next <ChevronRight className="size-3" />
				</button>
			</div>
		</div>
	);
}

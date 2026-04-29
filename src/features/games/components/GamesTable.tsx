import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { GamesSort } from "#/features/games/hooks/use-games";
import type { GameSummary } from "#/features/games/types";
import { type AnalysisProgress, GameTableRow } from "./GameTableRow";
import type { GameColumnMeta } from "./game-columns";

type GamesTableProps = {
	data: GameSummary[];
	columns: ColumnDef<GameSummary>[];
	username: string;
	/** Pass `null` to disable sort UI entirely (e.g. recent-games card). */
	sort: GamesSort | null;
	onSortChange?: (sort: GamesSort) => void;
	analysisById?: Map<string, AnalysisProgress>;
	isLoading?: boolean;
	emptyState?: React.ReactNode;
};

const HEADER_CLASS =
	"border-b border-divider bg-surface py-2.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-fg-3";

export function GamesTable({
	data,
	columns,
	username,
	sort,
	onSortChange,
	analysisById,
	isLoading,
	emptyState,
}: GamesTableProps) {
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		manualSorting: true,
		manualPagination: true,
	});

	return (
		<table className="w-full border-collapse text-ui">
			<thead>
				<tr>
					{table.getHeaderGroups()[0].headers.map((header, i) => {
						const meta = (header.column.columnDef.meta ?? {}) as GameColumnMeta;
						const align = meta.align ?? "left";
						const sortable = sort != null && header.column.getCanSort();
						const isActive = sort?.key === header.column.id;
						const isFirst = i === 0;
						const isLast = i === table.getHeaderGroups()[0].headers.length - 1;
						const padding = isFirst
							? "pl-5 pr-3"
							: isLast
								? "pl-3 pr-5"
								: "px-3";
						return (
							<th
								key={header.id}
								className={`${HEADER_CLASS} ${padding} ${align === "right" ? "text-right" : "text-left"}`}
							>
								{sortable ? (
									<button
										type="button"
										onClick={() =>
											onSortChange?.(toggleSort(sort, header.column.id))
										}
										className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""} cursor-pointer select-none uppercase tracking-[0.06em] text-fg-3 hover:text-fg-1`}
									>
										<span>
											{flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)}
										</span>
										<SortIndicator
											active={isActive}
											dir={isActive ? sort.dir : null}
										/>
									</button>
								) : (
									flexRender(
										header.column.columnDef.header,
										header.getContext(),
									)
								)}
							</th>
						);
					})}
				</tr>
			</thead>
			<tbody>
				{isLoading ? (
					<tr>
						<td
							colSpan={columns.length}
							className="py-8 text-center text-ui text-fg-3"
						>
							Loading…
						</td>
					</tr>
				) : data.length === 0 ? (
					<tr>
						<td colSpan={columns.length} className="py-12 text-center">
							{emptyState ?? (
								<span className="text-ui text-fg-3">No games yet.</span>
							)}
						</td>
					</tr>
				) : (
					data.map((game) => (
						<GameTableRow
							key={game.id}
							game={game}
							username={username}
							analysis={analysisById?.get(game.id)}
						/>
					))
				)}
			</tbody>
		</table>
	);
}

function toggleSort(sort: GamesSort, columnId: string): GamesSort {
	const key = columnId as GamesSort["key"];
	if (sort.key !== key) {
		// Default direction by data type: text ascending, numeric/date descending.
		const dir: GamesSort["dir"] =
			key === "opponent" || key === "opening" ? "asc" : "desc";
		return { key, dir };
	}
	return { key, dir: sort.dir === "asc" ? "desc" : "asc" };
}

function SortIndicator({
	active,
	dir,
}: {
	active: boolean;
	dir: "asc" | "desc" | null;
}) {
	if (!active) return <ChevronsUpDown className="size-3 opacity-30" />;
	return dir === "asc" ? (
		<ArrowUp className="size-3" />
	) : (
		<ArrowDown className="size-3" />
	);
}

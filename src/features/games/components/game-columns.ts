import type { ColumnDef } from "@tanstack/react-table";
import type { GameSummary } from "#/features/games/types";

export type GameColumnMeta = {
	align?: "left" | "right";
};

/**
 * Column definitions for the games table. Row content is rendered by
 * `GameTableRow` directly — these defs supply column id, header label,
 * sortability, and alignment metadata that the table shell consumes.
 */
export const GAMES_COLUMNS: ColumnDef<GameSummary>[] = [
	{
		id: "result",
		header: "Result",
		enableSorting: false,
		meta: { align: "left" },
	},
	{
		id: "opponent",
		header: "Opponent",
		enableSorting: true,
		meta: { align: "left" },
	},
	{
		id: "opening",
		header: "Opening",
		enableSorting: true,
		meta: { align: "left" },
	},
	{
		id: "time",
		header: "Time",
		enableSorting: false,
		meta: { align: "left" },
	},
	{
		id: "accuracy",
		header: "Accuracy",
		enableSorting: true,
		meta: { align: "right" },
	},
	{
		id: "score",
		header: "Game score",
		enableSorting: true,
		meta: { align: "right" },
	},
	{
		id: "date",
		header: "Played",
		enableSorting: true,
		meta: { align: "right" },
	},
];

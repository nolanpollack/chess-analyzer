import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { EvalConfig } from "./config";
import type { EvalRow } from "./evaluate-game";
import type { StratifiedMetrics } from "./metrics";

export type SweepEntry = {
	epsilon?: number;
	prior?: string;
	metrics: StratifiedMetrics;
};

export type SummaryReport = {
	config: EvalConfig;
	totalGames: number;
	metrics: StratifiedMetrics;
	sweeps?: SweepEntry[];
};

const CSV_HEADER =
	"gameId,side,trueRating,opponentRating,timeControlClass,nPositions,predicted,ciLow,ciHigh,withinCi,cacheHits,cacheMisses,uniquePositions\n";

function rowToCsv(row: EvalRow): string {
	return (
		[
			row.gameId,
			row.side,
			row.trueRating,
			row.opponentRating,
			row.timeControlClass,
			row.nPositions,
			row.predicted.toFixed(2),
			row.ciLow.toFixed(2),
			row.ciHigh.toFixed(2),
			row.withinCi ? "true" : "false",
			row.cacheHits,
			row.cacheMisses,
			row.uniquePositions,
		].join(",") + "\n"
	);
}

export async function writeCsv(
	outDir: string,
	rows: EvalRow[],
	filename = "results.csv",
): Promise<void> {
	await fs.mkdir(outDir, { recursive: true });
	const csvPath = path.join(outDir, filename);
	const handle = await fs.open(csvPath, "w");
	await handle.write(CSV_HEADER);
	for (const row of rows) {
		await handle.write(rowToCsv(row));
	}
	await handle.close();
}

export async function writeSummary(
	outDir: string,
	report: SummaryReport,
): Promise<void> {
	await fs.mkdir(outDir, { recursive: true });
	const summaryPath = path.join(outDir, "summary.json");
	await fs.writeFile(summaryPath, JSON.stringify(report, null, 2), "utf8");
}

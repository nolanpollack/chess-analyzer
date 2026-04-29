import type { PositionCache } from "#/lib/position-cache";
import type { EvalConfig, PriorName } from "./config";
import type { EvalRow } from "./evaluate-game";
import { evaluateGame } from "./evaluate-game";
import { pgnGameToSides } from "./game-to-positions";
import { computeStratifiedMetrics } from "./metrics";
import type { SummaryReport, SweepEntry } from "./output";
import { streamFilteredGames } from "./pgn-stream";
import { BAND_BOUNDARIES } from "./rating-bands";
import { TwoPassSampler } from "./sampling";

export type RunEvalResult = {
	rows: EvalRow[];
	report: SummaryReport;
};

function averageRating(whiteElo: string, blackElo: string): number {
	return (parseInt(whiteElo, 10) + parseInt(blackElo, 10)) / 2;
}

async function collectSampledGames(
	config: EvalConfig,
): Promise<Array<{ pgn: string; headers: Record<string, string> }>> {
	const sampler = new TwoPassSampler({
		targetPrimary: config.targetPrimary,
		targetPerBand: config.targetPerBand,
		bands: BAND_BOUNDARIES,
		hardCap: config.hardCap,
	});

	const games: Array<{ pgn: string; headers: Record<string, string> }> = [];
	let smokeCount = 0;

	for await (const raw of streamFilteredGames(config.input)) {
		const avg = averageRating(
			raw.headers["WhiteElo"] ?? "0",
			raw.headers["BlackElo"] ?? "0",
		);

		if (config.smokeN !== null) {
			// Smoke mode: just take first N matching games
			games.push({ pgn: raw.pgn, headers: raw.headers });
			smokeCount++;
			if (smokeCount >= config.smokeN) break;
			continue;
		}

		const decision = sampler.consider(avg);
		if (decision !== "skip") {
			games.push({ pgn: raw.pgn, headers: raw.headers });
		}

		if (sampler.done()) break;
	}

	return games;
}

async function evaluateAllGames(
	sampledGames: Array<{ pgn: string }>,
	cache: PositionCache,
	config: EvalConfig,
	epsilon: number,
	prior: PriorName,
): Promise<EvalRow[]> {
	const rows: EvalRow[] = [];
	const total = sampledGames.length;
	let i = 0;

	for (const { pgn } of sampledGames) {
		i++;
		const parsed = pgnGameToSides(pgn);
		if (!parsed) {
			console.error(`[eval] ${i}/${total}: skipped (parse failed)`);
			continue;
		}

		const t0 = Date.now();
		try {
			const gameRows = await evaluateGame(parsed, cache, {
				versions: config.versions,
				epsilon,
				prior,
				waitTimeoutMs: config.waitTimeoutMs,
				skipStockfish: config.skipStockfish,
				directBatch: config.directBatch,
			});
			rows.push(...gameRows);
			const ms = Date.now() - t0;
			const summary = gameRows
				.map(
					(r) =>
						`${r.side[0]}: true=${r.trueRating} pred=${r.predicted.toFixed(0)}`,
				)
				.join("  ");
			const firstRow = gameRows[0];
			const cacheStr = firstRow
				? `cache=${firstRow.cacheHits}/${firstRow.uniquePositions}`
				: "";
			console.error(
				`[eval] ${i}/${total} (${ms}ms ${cacheStr}) ${parsed.gameId}  ${summary}`,
			);
		} catch (err) {
			console.error(`[eval] ${i}/${total} FAILED ${parsed.gameId}:`, err);
		}
	}

	return rows;
}

/**
 * Top-level orchestrator. Samples games, evaluates each, returns rows + report.
 */
export async function runEval(
	config: EvalConfig,
	cache: PositionCache,
): Promise<RunEvalResult> {
	console.error(`[eval] Sampling games from ${config.input}...`);
	const sampledGames = await collectSampledGames(config);
	console.error(`[eval] Sampled ${sampledGames.length} games. Evaluating...`);

	const rows = await evaluateAllGames(
		sampledGames,
		cache,
		config,
		config.epsilon,
		config.prior,
	);

	const metrics = computeStratifiedMetrics(rows);

	const report: SummaryReport = {
		config,
		totalGames: rows.length,
		metrics,
	};

	return { rows, report };
}

/**
 * Run eval across multiple epsilon/prior combinations on the SAME sampled games.
 * Streams analysis once, re-runs estimateRating for each combo.
 */
export async function runEvalSweep(
	config: EvalConfig,
	cache: PositionCache,
	epsilons: number[],
	priors: PriorName[],
): Promise<RunEvalResult> {
	console.error(`[eval] Sampling games for sweep...`);
	const sampledGames = await collectSampledGames(config);
	console.error(`[eval] Sampled ${sampledGames.length} games.`);

	const sweepEntries: SweepEntry[] = [];

	let baseRows: EvalRow[] = [];

	for (const epsilon of epsilons) {
		for (const prior of priors) {
			console.error(
				`[eval] Sweep: epsilon=${epsilon} prior=${typeof prior === "string" ? prior : JSON.stringify(prior)}`,
			);
			const rows = await evaluateAllGames(
				sampledGames,
				cache,
				{ ...config, epsilon, prior },
				epsilon,
				prior,
			);

			if (baseRows.length === 0) baseRows = rows;

			sweepEntries.push({
				epsilon,
				prior: typeof prior === "string" ? prior : JSON.stringify(prior),
				metrics: computeStratifiedMetrics(rows),
			});
		}
	}

	const metrics = computeStratifiedMetrics(baseRows);
	const report: SummaryReport = {
		config,
		totalGames: baseRows.length,
		metrics,
		sweeps: sweepEntries,
	};

	return { rows: baseRows, report };
}

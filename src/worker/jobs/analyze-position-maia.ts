/**
 * analyze-position-maia worker job.
 *
 * Fetches move probability distributions from the Maia-2 inference service
 * and stores the result in the position cache (maia_cache table).
 *
 * Idempotent: checks for an existing cache row before calling the service.
 * Retries: pg-boss handles retries by re-throwing on error.
 */
import type { Job, PgBoss } from "pg-boss";
import {
	ANALYZE_POSITION_MAIA,
	type AnalyzePositionMaiaPayload,
} from "#/lib/analysis-dispatcher/job-names";
import { inferMaia } from "#/lib/maia-client";
import { createPositionCache } from "#/lib/position-cache";
import { getWorkerDb } from "#/worker/db";

export { ANALYZE_POSITION_MAIA };

export function registerAnalyzePositionMaiaJob(boss: PgBoss) {
	boss.work<AnalyzePositionMaiaPayload>(
		ANALYZE_POSITION_MAIA,
		{ pollingIntervalSeconds: 5, batchSize: 2 },
		async (jobs: Job<AnalyzePositionMaiaPayload>[]) => {
			await Promise.all(jobs.map((job) => handleAnalyzePositionMaia(job.data)));
		},
	);
}

async function handleAnalyzePositionMaia(
	data: AnalyzePositionMaiaPayload,
): Promise<void> {
	const { fen, maiaVersion } = data;
	console.log(`[analyze-position-maia] fen="${fen}" version=${maiaVersion}`);

	const cache = createPositionCache(getWorkerDb());

	const already = await cache.hasMaia(fen, maiaVersion);
	if (already) {
		console.log(`[analyze-position-maia] Cache hit, skipping fen="${fen}"`);
		return;
	}

	try {
		const response = await inferMaia(fen);
		validateVersionMatch(response.maiaVersion, maiaVersion);

		const probabilities = buildFloat32Array(
			response.probabilities,
			response.ratingGrid.length,
			response.moveIndex.length,
		);

		await cache.putMaia(fen, maiaVersion, {
			ratingGrid: response.ratingGrid,
			moveIndex: response.moveIndex,
			probabilities,
		});

		console.log(
			`[analyze-position-maia] Cached fen="${fen}" (${response.ratingGrid.length} ratings × ${response.moveIndex.length} moves)`,
		);
	} catch (err) {
		console.error(`[analyze-position-maia] Failed for fen="${fen}":`, err);
		throw err;
	}
}

function validateVersionMatch(
	serviceVersion: string,
	requestedVersion: string,
): void {
	if (serviceVersion !== requestedVersion) {
		throw new Error(
			`Maia version mismatch: service returned "${serviceVersion}" but job requested "${requestedVersion}". ` +
				"Check dispatcher config and service startup version.",
		);
	}
}

function buildFloat32Array(
	probabilities: number[][],
	nRatings: number,
	nMoves: number,
): Float32Array {
	const flat = new Float32Array(nRatings * nMoves);
	for (let r = 0; r < nRatings; r++) {
		const row = probabilities[r];
		for (let m = 0; m < nMoves; m++) {
			flat[r * nMoves + m] = row[m];
		}
	}
	return flat;
}

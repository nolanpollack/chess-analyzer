import type { AnalysisVersions } from "#/lib/analysis-dispatcher";
import { ensureAnalyzed } from "#/lib/analysis-dispatcher";
import type { PositionCache } from "#/lib/position-cache";
import type { Position } from "#/lib/rating-aggregator";
import { estimateRating } from "#/lib/rating-aggregator";
import type { PriorName } from "./config";
import type { TimeControlClass } from "./filter";
import type { ParsedGame } from "./game-to-positions";
import { buildPrior } from "./prior";

export type EvalRow = {
	gameId: string;
	side: "white" | "black";
	trueRating: number;
	opponentRating: number;
	timeControlClass: TimeControlClass;
	nPositions: number;
	predicted: number;
	ciLow: number;
	ciHigh: number;
	withinCi: boolean;
};

type EvaluateGameOptions = {
	versions: AnalysisVersions;
	epsilon: number;
	prior: PriorName;
	waitTimeoutMs: number;
};

async function buildPositionsForSide(
	fens: string[],
	playedMoves: string[],
	maiaMap: Map<string, import("#/lib/position-cache").MaiaOutput>,
): Promise<Position[]> {
	const positions: Position[] = [];
	for (let i = 0; i < fens.length; i++) {
		const maia = maiaMap.get(fens[i]);
		if (!maia) continue;
		positions.push({ fen: fens[i], playedMove: playedMoves[i], maia });
	}
	return positions;
}

/**
 * Ensures all positions in the game are analyzed, then estimates ratings
 * for both sides. Returns two EvalRows (one per side).
 */
export async function evaluateGame(
	game: ParsedGame,
	cache: PositionCache,
	opts: EvaluateGameOptions,
): Promise<EvalRow[]> {
	const allFens = [
		...game.white.positions.map((p) => p.fen),
		...game.black.positions.map((p) => p.fen),
	];

	await ensureAnalyzed(allFens, opts.versions, cache, {
		wait: true,
		waitTimeoutMs: opts.waitTimeoutMs,
	});

	const maiaMap = await cache.getMaiaBatch(allFens, opts.versions.maiaVersion);

	const rows: EvalRow[] = [];

	for (const side of [game.white, game.black] as const) {
		if (side.positions.length === 0) continue;

		const fens = side.positions.map((p) => p.fen);
		const moves = side.positions.map((p) => p.playedMove);
		const positions = await buildPositionsForSide(fens, moves, maiaMap);

		if (positions.length === 0) continue;

		const prior = buildPrior(opts.prior, positions[0].maia.ratingGrid);
		const estimate = estimateRating(positions, {
			epsilon: opts.epsilon,
			prior,
		});

		rows.push({
			gameId: game.gameId,
			side: side.side,
			trueRating: side.trueRating,
			opponentRating: side.opponentRating,
			timeControlClass: side.timeControlClass,
			nPositions: positions.length,
			predicted: estimate.pointEstimate,
			ciLow: estimate.ciLow,
			ciHigh: estimate.ciHigh,
			withinCi:
				side.trueRating >= estimate.ciLow && side.trueRating <= estimate.ciHigh,
		});
	}

	return rows;
}

/**
 * Backfill game_performance rows for all analyzed games that don't have one.
 *
 * Usage: bun run src/scripts/backfill-game-performance.ts
 */
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { gameAnalyses, gamePerformance, games, moveTags } from "#/db/schema";
import { computeGamePerformance, type MoveTagData } from "#/lib/performance";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL is required");
	process.exit(1);
}

const db = drizzle(DATABASE_URL);

async function backfill() {
	const analyses = await findAnalysesWithoutPerformance();
	console.log(
		`Found ${analyses.length} analyzed games without performance rows`,
	);

	let success = 0;
	for (const analysis of analyses) {
		try {
			await computeAndInsertPerformance(analysis);
			success++;
			if (success % 10 === 0) {
				console.log(`Processed ${success}/${analyses.length}`);
			}
		} catch (err) {
			console.error(
				`Failed for analysis ${analysis.id} (game ${analysis.gameId}):`,
				err,
			);
		}
	}

	console.log(
		`Backfill complete: ${success}/${analyses.length} games processed`,
	);
}

type AnalysisRow = {
	id: string;
	gameId: string;
	moves: unknown;
	playerId: string;
};

async function findAnalysesWithoutPerformance(): Promise<AnalysisRow[]> {
	return db
		.select({
			id: gameAnalyses.id,
			gameId: gameAnalyses.gameId,
			moves: gameAnalyses.moves,
			playerId: games.playerId,
		})
		.from(gameAnalyses)
		.innerJoin(games, eq(gameAnalyses.gameId, games.id))
		.leftJoin(
			gamePerformance,
			eq(gameAnalyses.id, gamePerformance.gameAnalysisId),
		)
		.where(
			and(eq(gameAnalyses.status, "complete"), isNull(gamePerformance.id)),
		);
}

async function computeAndInsertPerformance(analysis: AnalysisRow) {
	const moves = analysis.moves as import("#/db/schema").MoveAnalysis[];

	const tags = await db
		.select({
			ply: moveTags.ply,
			gamePhase: moveTags.gamePhase,
			piecesInvolved: moveTags.piecesInvolved,
			openingEco: moveTags.openingEco,
			openingName: moveTags.openingName,
			concepts: moveTags.concepts,
		})
		.from(moveTags)
		.where(eq(moveTags.gameAnalysisId, analysis.id));

	const tagData: MoveTagData[] = tags.map((t) => ({
		ply: t.ply,
		gamePhase: t.gamePhase,
		piecesInvolved: t.piecesInvolved,
		openingEco: t.openingEco,
		openingName: t.openingName,
		concepts: t.concepts,
	}));

	const perf = computeGamePerformance(moves, tagData);

	await db
		.insert(gamePerformance)
		.values({
			gameAnalysisId: analysis.id,
			playerId: analysis.playerId,
			...perf,
		})
		.onConflictDoUpdate({
			target: gamePerformance.gameAnalysisId,
			set: { ...perf, computedAt: new Date() },
		});
}

backfill().catch(console.error);

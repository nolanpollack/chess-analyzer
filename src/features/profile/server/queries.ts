import { createServerFn } from "@tanstack/react-start";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
	type ConceptDimension,
	DIMENSION_LABELS,
	getConceptById,
	getConceptsByDimension,
} from "#/config/concepts";
import { db } from "#/db/index";
import {
	type ChessPiece,
	type GamePhase,
	gameAnalyses,
	gamePerformance,
	games,
	type MoveAnalysis,
	type MoveClassification,
	moveTags,
	playerProfile,
	players,
} from "#/db/schema";
import { recomputeProfile } from "#/features/profile/server/recompute";
import { accuracyToElo } from "#/lib/elo-estimate";

const GOOD_OR_BETTER_CLASSIFICATIONS: Set<MoveClassification> = new Set([
	"brilliant",
	"best",
	"good",
]);

const phaseSchema = z.enum(["opening", "middlegame", "endgame"]);
const pieceSchema = z.enum([
	"pawn",
	"knight",
	"bishop",
	"rook",
	"queen",
	"king",
]);
const categorySchema = z.enum([
	"tactical",
	"positional",
	"strategic",
	"endgame",
]);

const dimensionSchema = z.enum(["phase", "piece", "category", "opening"]);

export type DimensionType = z.infer<typeof dimensionSchema>;

type TrendDirection = "improving" | "declining" | "stable";

type PieceBreakdown = { piece: string; accuracy: number; moveCount: number };
type PhaseBreakdown = { phase: string; accuracy: number; moveCount: number };
type ConceptBreakdown = {
	concept: string;
	missCount: number;
	totalCount: number;
};
type OpeningBreakdown = {
	eco: string;
	name: string;
	accuracy: number;
	gameCount: number;
};

type DrilldownExample = {
	gameId: string;
	opponentUsername: string;
	ply: number;
	moveSan: string;
	classification: string;
	evalDelta: number;
	concepts: string[];
	pieces: string[];
};

export type DimensionDrilldownData = {
	primary: {
		label: string;
		accuracy: number;
		avgCpLoss: number;
		moveCount: number;
		gameCount: number;
		overallAccuracy: number;
		isWeakest: boolean;
		weakestLabel: string | null;
	};
	trend: {
		recentAccuracy: number;
		olderAccuracy: number;
		direction: TrendDirection;
	};
	byPiece?: PieceBreakdown[];
	byPhase?: PhaseBreakdown[];
	byConcept: ConceptBreakdown[];
	byOpening?: OpeningBreakdown[];
	examples: DrilldownExample[];
	conceptSampleSize: number;
};

type TaggedMoveRow = {
	gameId: string;
	gameAnalysisId: string;
	playedAt: string;
	opponentUsername: string;
	gameOpeningEco: string | null;
	gameOpeningName: string | null;
	phase: GamePhase;
	pieces: ChessPiece[];
	concepts: string[];
	ply: number;
	classification: MoveClassification;
	evalDelta: number;
	moveSan: string;
};

type Bucket = { total: number; good: number; cpLossSum: number };

function emptyBucket(): Bucket {
	return { total: 0, good: 0, cpLossSum: 0 };
}

export const getPlayerProfile = createServerFn({ method: "GET" })
	.inputValidator(z.object({ username: z.string().min(1) }))
	.handler(async ({ data }) => {
		const { username } = data;

		try {
			const [player] = await db
				.select()
				.from(players)
				.where(eq(players.username, username.toLowerCase().trim()));

			if (!player) {
				return { error: "Player not found" };
			}

			const [existing] = await db
				.select()
				.from(playerProfile)
				.where(eq(playerProfile.playerId, player.id));

			if (existing) {
				return {
					profile: {
						...existing,
						computedAt: existing.computedAt.toISOString(),
					},
				};
			}

			const result = await recomputeProfile(player.id);
			if (!result) {
				return { profile: null };
			}

			return {
				profile: {
					...result,
					computedAt: result.computedAt.toISOString(),
				},
			};
		} catch (err) {
			console.error("[getPlayerProfile] Error:", err);
			return { error: "Failed to load player profile" };
		}
	});

export const getAccuracyTrend = createServerFn({ method: "GET" })
	.inputValidator(z.object({ username: z.string().min(1) }))
	.handler(async ({ data }) => {
		const { username } = data;

		try {
			const [player] = await db
				.select()
				.from(players)
				.where(eq(players.username, username.toLowerCase().trim()));

			if (!player) {
				return { error: "Player not found" };
			}

			const rows = await db
				.select({
					gameId: games.id,
					playedAt: games.playedAt,
					accuracy: gamePerformance.overallAccuracy,
					opponent: games.opponentUsername,
				})
				.from(gamePerformance)
				.innerJoin(
					gameAnalyses,
					eq(gamePerformance.gameAnalysisId, gameAnalyses.id),
				)
				.innerJoin(games, eq(gameAnalyses.gameId, games.id))
				.where(eq(gamePerformance.playerId, player.id))
				.orderBy(asc(games.playedAt));

			return {
				trend: rows.map((r) => ({
					gameId: r.gameId,
					playedAt: r.playedAt.toISOString(),
					accuracy: r.accuracy,
					opponent: r.opponent,
				})),
			};
		} catch (err) {
			console.error("[getAccuracyTrend] Error:", err);
			return { error: "Failed to load accuracy trend" };
		}
	});

export const getDimensionDrilldown = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			username: z.string().min(1),
			dimension: dimensionSchema,
			value: z.string().min(1),
		}),
	)
	.handler(async ({ data }) => {
		const { username, dimension, value } = data;

		try {
			const normalizedUsername = username.toLowerCase().trim();
			const [player] = await db
				.select()
				.from(players)
				.where(eq(players.username, normalizedUsername));

			if (!player) {
				return { error: "Player not found" };
			}

			const [existingProfile] = await db
				.select()
				.from(playerProfile)
				.where(eq(playerProfile.playerId, player.id));

			const profile = existingProfile ?? (await recomputeProfile(player.id));
			if (!profile) {
				return { drilldown: emptyDrilldownData(dimension, value) };
			}

			const normalizedValue = normalizeDimensionValue(dimension, value);
			if (!normalizedValue) {
				return { error: "Invalid drill-down value" };
			}

			const taggedMoves = await loadTaggedMovesForPlayer(player.id);
			const filteredMoves = filterTaggedMovesByDimension(
				taggedMoves,
				dimension,
				normalizedValue,
			);

			const drilldown = buildDimensionDrilldownData({
				dimension,
				value: normalizedValue,
				moves: filteredMoves,
				profile,
			});

			return { drilldown };
		} catch (err) {
			console.error("[getDimensionDrilldown] Error:", err);
			return { error: "Failed to load drill-down data" };
		}
	});

export const getPlayerSummary = createServerFn({ method: "GET" })
	.inputValidator(z.object({ username: z.string().min(1) }))
	.handler(async ({ data }) => {
		const { username } = data;

		try {
			const [player] = await db
				.select()
				.from(players)
				.where(eq(players.username, username.toLowerCase().trim()));

			if (!player) {
				return { error: "Player not found" };
			}

			const [gameCountRow, perfRows] = await Promise.all([
				db
					.select({ playerRating: games.playerRating })
					.from(games)
					.where(eq(games.playerId, player.id))
					.orderBy(desc(games.playedAt)),
				db
					.select({
						overallAccuracy: gamePerformance.overallAccuracy,
						playedAt: games.playedAt,
					})
					.from(gamePerformance)
					.innerJoin(
						gameAnalyses,
						eq(gamePerformance.gameAnalysisId, gameAnalyses.id),
					)
					.innerJoin(games, eq(gameAnalyses.gameId, games.id))
					.where(eq(gamePerformance.playerId, player.id))
					.orderBy(desc(games.playedAt)),
			]);

			const currentRating = gameCountRow[0]?.playerRating ?? null;
			const eloEstimate = computeEloEstimate(perfRows);
			const eloDelta30d = computeEloDelta30d(perfRows);

			return {
				summary: {
					currentRating,
					gameCount: gameCountRow.length,
					analyzedGameCount: perfRows.length,
					eloEstimate,
					eloDelta30d,
				},
			};
		} catch (err) {
			console.error("[getPlayerSummary] Error:", err);
			return { error: "Failed to load player summary" };
		}
	});

const trendRangeSchema = z.enum(["1m", "3m", "6m", "1y", "all"]);
export type TrendRange = z.infer<typeof trendRangeSchema>;

export const getRatingTrend = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			username: z.string().min(1),
			range: trendRangeSchema.default("6m"),
		}),
	)
	.handler(async ({ data }) => {
		const { username, range } = data;

		try {
			const [player] = await db
				.select()
				.from(players)
				.where(eq(players.username, username.toLowerCase().trim()));

			if (!player) {
				return { error: "Player not found" };
			}

			const rows = await db
				.select({
					playedAt: games.playedAt,
					overallAccuracy: gamePerformance.overallAccuracy,
				})
				.from(gamePerformance)
				.innerJoin(
					gameAnalyses,
					eq(gamePerformance.gameAnalysisId, gameAnalyses.id),
				)
				.innerJoin(games, eq(gameAnalyses.gameId, games.id))
				.where(eq(gamePerformance.playerId, player.id))
				.orderBy(asc(games.playedAt));

			const allWeeks = computeRollingRatings(rows);
			const since = rangeStartDate(range);
			const weeks = since
				? allWeeks.filter((w) => new Date(w.weekStart) >= since)
				: allWeeks;

			return { weeks };
		} catch (err) {
			console.error("[getRatingTrend] Error:", err);
			return { error: "Failed to load rating trend" };
		}
	});

// ── Drill-down helpers ────────────────────────────────────────────────

function normalizeDimensionValue(
	dimension: DimensionType,
	value: string,
): string | null {
	const trimmed = value.trim();

	if (dimension === "phase") {
		const parsed = phaseSchema.safeParse(trimmed.toLowerCase());
		return parsed.success ? parsed.data : null;
	}

	if (dimension === "piece") {
		const parsed = pieceSchema.safeParse(trimmed.toLowerCase());
		return parsed.success ? parsed.data : null;
	}

	if (dimension === "category") {
		const parsed = categorySchema.safeParse(trimmed.toLowerCase());
		return parsed.success ? parsed.data : null;
	}

	return trimmed.toUpperCase();
}

async function loadTaggedMovesForPlayer(
	playerId: string,
): Promise<TaggedMoveRow[]> {
	const rows = await db
		.select({
			gameId: games.id,
			gameAnalysisId: gameAnalyses.id,
			playedAt: games.playedAt,
			opponentUsername: games.opponentUsername,
			gameOpeningEco: games.openingEco,
			gameOpeningName: games.openingName,
			phase: moveTags.gamePhase,
			pieces: moveTags.piecesInvolved,
			concepts: moveTags.concepts,
			ply: moveTags.ply,
			moves: gameAnalyses.moves,
		})
		.from(moveTags)
		.innerJoin(gameAnalyses, eq(moveTags.gameAnalysisId, gameAnalyses.id))
		.innerJoin(games, eq(gameAnalyses.gameId, games.id))
		.where(eq(moveTags.playerId, playerId))
		.orderBy(desc(games.playedAt));

	const taggedMoves: TaggedMoveRow[] = [];

	for (const row of rows) {
		const move = findMoveByPly(row.moves as MoveAnalysis[], row.ply);
		if (!move || !move.is_player_move) continue;

		taggedMoves.push({
			gameId: row.gameId,
			gameAnalysisId: row.gameAnalysisId,
			playedAt: row.playedAt.toISOString(),
			opponentUsername: row.opponentUsername,
			gameOpeningEco: row.gameOpeningEco,
			gameOpeningName: row.gameOpeningName,
			phase: row.phase,
			pieces: row.pieces,
			concepts: row.concepts ?? [],
			ply: row.ply,
			classification: move.classification,
			evalDelta: move.eval_delta,
			moveSan: move.san,
		});
	}

	return taggedMoves;
}

function findMoveByPly(
	moves: MoveAnalysis[],
	ply: number,
): MoveAnalysis | null {
	for (const move of moves) {
		if (move.ply === ply) return move;
	}
	return null;
}

function filterTaggedMovesByDimension(
	moves: TaggedMoveRow[],
	dimension: DimensionType,
	value: string,
): TaggedMoveRow[] {
	if (dimension === "phase") {
		const phase = value as GamePhase;
		return moves.filter((move) => move.phase === phase);
	}

	if (dimension === "piece") {
		const piece = value as ChessPiece;
		return moves.filter((move) => move.pieces.includes(piece));
	}

	if (dimension === "category") {
		const category = value as ConceptDimension;
		const categoryConceptIds = new Set(
			getConceptsByDimension(category).map((concept) => concept.id),
		);
		return moves.filter((move) =>
			move.concepts.some((concept) => categoryConceptIds.has(concept)),
		);
	}

	const prefix = value.toUpperCase();
	return moves.filter((move) => (move.gameOpeningEco ?? "").startsWith(prefix));
}

function buildDimensionDrilldownData({
	dimension,
	value,
	moves,
	profile,
}: {
	dimension: DimensionType;
	value: string;
	moves: TaggedMoveRow[];
	profile: Awaited<ReturnType<typeof recomputeProfile>>;
}): DimensionDrilldownData {
	if (!profile) {
		return emptyDrilldownData(dimension, value);
	}

	const primaryLabel = getPrimaryLabel(dimension, value, moves);
	const primaryStats = computePrimaryStats(moves, profile.overallAccuracy);
	const weakestInfo = getWeakestInfo(dimension, value, profile);
	const trend = computeDimensionTrend(moves);
	const byConcept = computeConceptBreakdown(dimension, value, moves);

	const result: DimensionDrilldownData = {
		primary: {
			label: primaryLabel,
			accuracy: primaryStats.accuracy,
			avgCpLoss: primaryStats.avgCpLoss,
			moveCount: primaryStats.moveCount,
			gameCount: primaryStats.gameCount,
			overallAccuracy: profile.overallAccuracy,
			isWeakest: weakestInfo.isWeakest,
			weakestLabel: weakestInfo.label,
		},
		trend,
		byConcept: byConcept.rows,
		examples: buildExamples(moves),
		conceptSampleSize: byConcept.sampleSize,
	};

	if (dimension !== "piece") {
		result.byPiece = computePieceBreakdown(moves);
	}

	if (dimension !== "phase") {
		result.byPhase = computePhaseBreakdown(moves);
	}

	if (dimension !== "opening") {
		result.byOpening = computeOpeningBreakdown(moves);
	}

	return result;
}

function getPrimaryLabel(
	dimension: DimensionType,
	value: string,
	moves: TaggedMoveRow[],
): string {
	if (dimension === "phase") return capitalize(value);
	if (dimension === "piece") return capitalize(value);
	if (dimension === "category") {
		return DIMENSION_LABELS[value as ConceptDimension] ?? capitalize(value);
	}
	const openingName = moves.find(
		(move) => move.gameOpeningName,
	)?.gameOpeningName;
	return openingName ? `${value} - ${openingName}` : value;
}

function computePrimaryStats(
	moves: TaggedMoveRow[],
	overallAccuracy: number,
): {
	accuracy: number;
	avgCpLoss: number;
	moveCount: number;
	gameCount: number;
	overallAccuracy: number;
} {
	const bucket = summarizeMoves(moves);
	const gameIds = new Set(moves.map((move) => move.gameId));
	return {
		accuracy: computeAccuracy(bucket.good, bucket.total),
		avgCpLoss: computeAvgCpLoss(bucket.cpLossSum, bucket.total),
		moveCount: bucket.total,
		gameCount: gameIds.size,
		overallAccuracy,
	};
}

function summarizeMoves(moves: TaggedMoveRow[]): Bucket {
	const bucket = emptyBucket();
	for (const move of moves) {
		bucket.total += 1;
		if (isGoodOrBetter(move.classification)) bucket.good += 1;
		bucket.cpLossSum += normalizeCpLoss(move.evalDelta);
	}
	return bucket;
}

function normalizeCpLoss(evalDelta: number): number {
	return Math.max(0, Math.min(1000, -evalDelta));
}

function isGoodOrBetter(classification: MoveClassification): boolean {
	return GOOD_OR_BETTER_CLASSIFICATIONS.has(classification);
}

function computeAccuracy(good: number, total: number): number {
	if (total === 0) return 0;
	return Math.round((good / total) * 1000) / 10;
}

function computeAvgCpLoss(cpLossSum: number, total: number): number {
	if (total === 0) return 0;
	return Math.round((cpLossSum / total) * 10) / 10;
}

function computeDimensionTrend(moves: TaggedMoveRow[]): {
	recentAccuracy: number;
	olderAccuracy: number;
	direction: TrendDirection;
} {
	const byGame = new Map<string, { playedAt: string; bucket: Bucket }>();

	for (const move of moves) {
		const existing = byGame.get(move.gameId);
		if (!existing) {
			const bucket = summarizeMoves([move]);
			byGame.set(move.gameId, { playedAt: move.playedAt, bucket });
			continue;
		}

		existing.bucket.total += 1;
		if (isGoodOrBetter(move.classification)) existing.bucket.good += 1;
		existing.bucket.cpLossSum += normalizeCpLoss(move.evalDelta);
	}

	const gameRows = Array.from(byGame.values()).sort((a, b) =>
		b.playedAt.localeCompare(a.playedAt),
	);

	const recent = gameRows.slice(0, 20);
	const older = gameRows.slice(20);

	const recentAccuracy = weightedAccuracyFromBuckets(
		recent.map((row) => row.bucket),
	);
	const olderAccuracy =
		older.length > 0
			? weightedAccuracyFromBuckets(older.map((row) => row.bucket))
			: recentAccuracy;

	return {
		recentAccuracy,
		olderAccuracy,
		direction: getTrendDirection(recentAccuracy, olderAccuracy),
	};
}

function weightedAccuracyFromBuckets(buckets: Bucket[]): number {
	let total = 0;
	let good = 0;
	for (const bucket of buckets) {
		total += bucket.total;
		good += bucket.good;
	}
	return computeAccuracy(good, total);
}

function getTrendDirection(recent: number, older: number): TrendDirection {
	const diff = recent - older;
	if (diff >= 2) return "improving";
	if (diff <= -2) return "declining";
	return "stable";
}

function computePieceBreakdown(moves: TaggedMoveRow[]): PieceBreakdown[] {
	const byPiece = new Map<string, Bucket>();

	for (const move of moves) {
		for (const piece of move.pieces) {
			const bucket = byPiece.get(piece) ?? emptyBucket();
			bucket.total += 1;
			if (isGoodOrBetter(move.classification)) bucket.good += 1;
			bucket.cpLossSum += normalizeCpLoss(move.evalDelta);
			byPiece.set(piece, bucket);
		}
	}

	return Array.from(byPiece.entries())
		.map(([piece, bucket]) => ({
			piece,
			accuracy: computeAccuracy(bucket.good, bucket.total),
			moveCount: bucket.total,
		}))
		.sort((a, b) => a.accuracy - b.accuracy);
}

function computePhaseBreakdown(moves: TaggedMoveRow[]): PhaseBreakdown[] {
	const byPhase = new Map<GamePhase, Bucket>();

	for (const move of moves) {
		const bucket = byPhase.get(move.phase) ?? emptyBucket();
		bucket.total += 1;
		if (isGoodOrBetter(move.classification)) bucket.good += 1;
		bucket.cpLossSum += normalizeCpLoss(move.evalDelta);
		byPhase.set(move.phase, bucket);
	}

	return Array.from(byPhase.entries())
		.map(([phase, bucket]) => ({
			phase,
			accuracy: computeAccuracy(bucket.good, bucket.total),
			moveCount: bucket.total,
		}))
		.sort((a, b) => a.accuracy - b.accuracy);
}

function computeOpeningBreakdown(moves: TaggedMoveRow[]): OpeningBreakdown[] {
	type OpeningBucket = Bucket & { gameIds: Set<string>; name: string };
	const byOpening = new Map<string, OpeningBucket>();

	for (const move of moves) {
		const eco = move.gameOpeningEco;
		if (!eco) continue;

		const existing = byOpening.get(eco) ?? {
			...emptyBucket(),
			gameIds: new Set<string>(),
			name: move.gameOpeningName ?? eco,
		};

		existing.total += 1;
		if (isGoodOrBetter(move.classification)) existing.good += 1;
		existing.cpLossSum += normalizeCpLoss(move.evalDelta);
		existing.gameIds.add(move.gameId);
		byOpening.set(eco, existing);
	}

	return Array.from(byOpening.entries())
		.map(([eco, bucket]) => ({
			eco,
			name: bucket.name,
			accuracy: computeAccuracy(bucket.good, bucket.total),
			gameCount: bucket.gameIds.size,
		}))
		.sort((a, b) => a.accuracy - b.accuracy)
		.slice(0, 10);
}

function computeConceptBreakdown(
	dimension: DimensionType,
	value: string,
	moves: TaggedMoveRow[],
): { rows: ConceptBreakdown[]; sampleSize: number } {
	const explainedMoves = moves.filter((move) => move.concepts.length > 0);
	const conceptStats = new Map<
		string,
		{ missCount: number; totalCount: number }
	>();
	const categoryConcepts =
		dimension === "category"
			? new Set(
					getConceptsByDimension(value as ConceptDimension).map(
						(concept) => concept.id,
					),
				)
			: null;

	for (const move of explainedMoves) {
		for (const concept of move.concepts) {
			if (categoryConcepts && !categoryConcepts.has(concept)) continue;

			const stat = conceptStats.get(concept) ?? { missCount: 0, totalCount: 0 };
			stat.totalCount += 1;
			if (!isGoodOrBetter(move.classification)) {
				stat.missCount += 1;
			}
			conceptStats.set(concept, stat);
		}
	}

	const rows = Array.from(conceptStats.entries())
		.map(([concept, stats]) => ({
			concept,
			label: getConceptById(concept)?.name ?? concept,
			missCount: stats.missCount,
			totalCount: stats.totalCount,
		}))
		.sort((a, b) => b.missCount - a.missCount)
		.slice(0, 10)
		.map(({ concept, missCount, totalCount }) => ({
			concept,
			missCount,
			totalCount,
		}));

	return {
		rows,
		sampleSize: explainedMoves.length,
	};
}

function buildExamples(moves: TaggedMoveRow[]): DrilldownExample[] {
	return [...moves]
		.sort((a, b) => a.evalDelta - b.evalDelta)
		.filter((move) => move.evalDelta < 0)
		.slice(0, 8)
		.map((move) => ({
			gameId: move.gameId,
			opponentUsername: move.opponentUsername,
			ply: move.ply,
			moveSan: move.moveSan,
			classification: move.classification,
			evalDelta: move.evalDelta,
			concepts: move.concepts,
			pieces: move.pieces,
		}));
}

function getWeakestInfo(
	dimension: DimensionType,
	value: string,
	profile: NonNullable<Awaited<ReturnType<typeof recomputeProfile>>>,
): { isWeakest: boolean; label: string | null } {
	if (dimension === "phase") {
		const entries: { key: string; accuracy: number | null }[] = [
			{ key: "opening", accuracy: profile.openingAccuracy },
			{ key: "middlegame", accuracy: profile.middlegameAccuracy },
			{ key: "endgame", accuracy: profile.endgameAccuracy },
		];
		const weakest = getWeakestByAccuracy(entries);
		return {
			isWeakest: weakest === value,
			label: weakest === value ? "Weakest phase" : null,
		};
	}

	if (dimension === "piece") {
		const entries = Object.entries(profile.pieceStats)
			.filter(([, stats]) => stats.moveCount > 0)
			.map(([key, stats]) => ({ key, accuracy: stats.accuracy }));
		const weakest = getWeakestByAccuracy(entries);
		return {
			isWeakest: weakest === value,
			label: weakest === value ? "Weakest piece" : null,
		};
	}

	if (dimension === "category") {
		const categoryEntries = Object.entries(profile.categoryStats ?? {}).map(
			([key, stats]) => ({ key, accuracy: stats.accuracy }),
		);
		const weakest = getWeakestByAccuracy(categoryEntries);
		return {
			isWeakest: weakest === value,
			label: weakest === value ? "Weakest category" : null,
		};
	}

	return { isWeakest: false, label: null };
}

function getWeakestByAccuracy(
	entries: { key: string; accuracy: number | null }[],
): string | null {
	const eligible = entries.filter((entry) => entry.accuracy !== null);
	if (eligible.length === 0) return null;

	let weakest = eligible[0];
	for (const entry of eligible) {
		if ((entry.accuracy ?? 0) < (weakest.accuracy ?? 0)) weakest = entry;
	}

	return weakest.key;
}

function emptyDrilldownData(
	dimension: DimensionType,
	value: string,
): DimensionDrilldownData {
	const data: DimensionDrilldownData = {
		primary: {
			label: getPrimaryLabel(dimension, value, []),
			accuracy: 0,
			avgCpLoss: 0,
			moveCount: 0,
			gameCount: 0,
			overallAccuracy: 0,
			isWeakest: false,
			weakestLabel: null,
		},
		trend: {
			recentAccuracy: 0,
			olderAccuracy: 0,
			direction: "stable",
		},
		byConcept: [],
		examples: [],
		conceptSampleSize: 0,
	};

	if (dimension !== "piece") data.byPiece = [];
	if (dimension !== "phase") data.byPhase = [];
	if (dimension !== "opening") data.byOpening = [];

	return data;
}

function capitalize(value: string): string {
	if (value.length === 0) return value;
	return `${value[0].toUpperCase()}${value.slice(1)}`;
}

export const __profileDrilldownTestUtils = {
	buildDimensionDrilldownData,
	emptyDrilldownData,
	filterTaggedMovesByDimension,
};

export type DrilldownTaggedMoveRow = TaggedMoveRow;

// ── Rating trend helpers ──────────────────────────────────────────────

const TREND_TRAILING_WINDOW = 20;

function rangeStartDate(range: TrendRange): Date | null {
	const now = Date.now();
	const day = 24 * 60 * 60 * 1000;
	if (range === "1m") return new Date(now - 30 * day);
	if (range === "3m") return new Date(now - 91 * day);
	if (range === "6m") return new Date(now - 183 * day);
	if (range === "1y") return new Date(now - 365 * day);
	return null;
}

function computeRollingRatings(
	rows: { playedAt: Date; overallAccuracy: number }[],
): { weekStart: string; rating: number }[] {
	if (rows.length === 0) return [];

	const weekKeys = [
		...new Set(rows.map((r) => startOfWeek(r.playedAt).toISOString())),
	].sort();

	return weekKeys.map((weekStart) => {
		const weekEnd = new Date(weekStart);
		weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
		const gamesUpToWeek = rows
			.filter((r) => r.playedAt < weekEnd)
			.slice(-TREND_TRAILING_WINDOW);
		const avgAcc =
			gamesUpToWeek.reduce((sum, r) => sum + r.overallAccuracy, 0) /
			gamesUpToWeek.length;
		return { weekStart, rating: accuracyToElo(avgAcc) };
	});
}

function startOfWeek(date: Date): Date {
	const d = new Date(date);
	d.setUTCHours(0, 0, 0, 0);
	const day = d.getUTCDay();
	const diff = (day + 6) % 7; // week starts Monday
	d.setUTCDate(d.getUTCDate() - diff);
	return d;
}

// ── Summary helpers ───────────────────────────────────────────────────

type PerfRow = { overallAccuracy: number; playedAt: Date };

// Size of each trailing window used for the 30d delta comparison.
const TRAILING_WINDOW = 20;

function avgAccuracy(rows: PerfRow[]): number | null {
	if (rows.length === 0) return null;
	return rows.reduce((sum, r) => sum + r.overallAccuracy, 0) / rows.length;
}

function computeEloEstimate(rows: PerfRow[]): number | null {
	const avg = avgAccuracy(rows);
	return avg !== null ? accuracyToElo(avg) : null;
}

function computeEloDelta30d(rows: PerfRow[]): number | null {
	// rows are ordered desc(playedAt) — most recent first
	const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
	const before30d = rows.filter((r) => r.playedAt < thirtyDaysAgo);

	if (rows.length === 0 || before30d.length === 0) return null;

	// Trailing N games anchored at today vs trailing N games anchored at 30d ago
	const windowNow = rows.slice(0, TRAILING_WINDOW);
	const window30d = before30d.slice(0, TRAILING_WINDOW);

	const avgNow = avgAccuracy(windowNow) as number;
	const avg30d = avgAccuracy(window30d) as number;
	return accuracyToElo(avgNow) - accuracyToElo(avg30d);
}

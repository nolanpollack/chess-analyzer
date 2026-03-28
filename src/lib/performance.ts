/**
 * Performance computation logic for game-level and player-level stats.
 * Computes accuracy breakdowns by phase, piece, concept, and opening.
 */

import { ANALYSIS_CONFIG } from "#/config/analysis";
import { getDimensionForConcept } from "#/config/concepts";
import type {
	CategoryStats,
	ChessPiece,
	ConceptStats,
	GamePhase,
	MoveAnalysis,
	MoveClassification,
	OpeningStats,
	PieceStats,
	StudyRecommendation,
	Weakness,
} from "#/db/schema";

// ── Helpers ───────────────────────────────────────────────────────────

const GOOD_OR_BETTER: Set<MoveClassification> = new Set([
	"brilliant",
	"best",
	"good",
]);

function isGoodOrBetter(c: MoveClassification): boolean {
	return GOOD_OR_BETTER.has(c);
}

function accuracy(goodCount: number, total: number): number | null {
	if (total === 0) return null;
	return Math.round((goodCount / total) * 1000) / 10;
}

function avgCpLoss(totalLoss: number, count: number): number | null {
	if (count === 0) return null;
	return Math.round((totalLoss / count) * 10) / 10;
}

// ── Per-Move Tag Data (passed in from move_tags) ──────────────────────

export type MoveTagData = {
	ply: number;
	gamePhase: GamePhase;
	piecesInvolved: ChessPiece[];
	openingEco: string | null;
	openingName: string | null;
	concepts: string[] | null;
};

// ── Per-Game Performance ──────────────────────────────────────────────

export type GamePerformanceResult = {
	overallAccuracy: number;
	overallAvgCpLoss: number;
	openingAccuracy: number | null;
	openingAvgCpLoss: number | null;
	openingMoveCount: number;
	middlegameAccuracy: number | null;
	middlegameAvgCpLoss: number | null;
	middlegameMoveCount: number;
	endgameAccuracy: number | null;
	endgameAvgCpLoss: number | null;
	endgameMoveCount: number;
	pieceStats: PieceStats;
	conceptStats: ConceptStats | null;
	explainedMoveCount: number;
};

type Bucket = {
	good: number;
	total: number;
	cpLossSum: number;
};

function emptyBucket(): Bucket {
	return { good: 0, total: 0, cpLossSum: 0 };
}

/**
 * Compute per-game performance from the player's moves + their tags.
 * Only considers is_player_move === true moves.
 */
export function computeGamePerformance(
	moves: MoveAnalysis[],
	tags: MoveTagData[],
): GamePerformanceResult {
	const tagByPly = new Map<number, MoveTagData>();
	for (const t of tags) {
		tagByPly.set(t.ply, t);
	}

	// Filter to player moves only
	const playerMoves = moves.filter((m) => m.is_player_move);

	// Buckets
	const overall = emptyBucket();
	const byPhase: Record<GamePhase, Bucket> = {
		opening: emptyBucket(),
		middlegame: emptyBucket(),
		endgame: emptyBucket(),
	};
	const byPiece: Record<string, Bucket> = {};
	const conceptHits: Record<
		string,
		{ hit: number; miss: number; total: number }
	> = {};
	let explainedMoveCount = 0;

	for (const move of playerMoves) {
		const tag = tagByPly.get(move.ply);
		if (!tag) continue;

		const good = isGoodOrBetter(move.classification);
		const cpLoss = Math.min(
			ANALYSIS_CONFIG.evalClamp,
			Math.max(0, -move.eval_delta),
		);

		// Overall
		overall.total++;
		if (good) overall.good++;
		overall.cpLossSum += cpLoss;

		// By phase
		const phase = byPhase[tag.gamePhase];
		phase.total++;
		if (good) phase.good++;
		phase.cpLossSum += cpLoss;

		// By piece
		for (const piece of tag.piecesInvolved) {
			if (!byPiece[piece]) byPiece[piece] = emptyBucket();
			byPiece[piece].total++;
			if (good) byPiece[piece].good++;
			byPiece[piece].cpLossSum += cpLoss;
		}

		// Concepts (from explained moves)
		if (tag.concepts && tag.concepts.length > 0) {
			explainedMoveCount++;
			for (const concept of tag.concepts) {
				if (!conceptHits[concept]) {
					conceptHits[concept] = { hit: 0, miss: 0, total: 0 };
				}
				conceptHits[concept].total++;
				if (good) {
					conceptHits[concept].hit++;
				} else {
					conceptHits[concept].miss++;
				}
			}
		}
	}

	// Build piece stats
	const allPieces: ChessPiece[] = [
		"pawn",
		"knight",
		"bishop",
		"rook",
		"queen",
		"king",
	];
	const pieceStats = {} as PieceStats;
	for (const piece of allPieces) {
		const b = byPiece[piece] ?? emptyBucket();
		pieceStats[piece] = {
			accuracy: accuracy(b.good, b.total) ?? 0,
			avgCpLoss: avgCpLoss(b.cpLossSum, b.total) ?? 0,
			moveCount: b.total,
		};
	}

	// Build concept stats
	const conceptStats: ConceptStats | null =
		Object.keys(conceptHits).length > 0
			? Object.fromEntries(
					Object.entries(conceptHits).map(([k, v]) => [
						k,
						{ hitCount: v.hit, missCount: v.miss, total: v.total },
					]),
				)
			: null;

	return {
		overallAccuracy: accuracy(overall.good, overall.total) ?? 0,
		overallAvgCpLoss: avgCpLoss(overall.cpLossSum, overall.total) ?? 0,
		openingAccuracy: accuracy(byPhase.opening.good, byPhase.opening.total),
		openingAvgCpLoss: avgCpLoss(
			byPhase.opening.cpLossSum,
			byPhase.opening.total,
		),
		openingMoveCount: byPhase.opening.total,
		middlegameAccuracy: accuracy(
			byPhase.middlegame.good,
			byPhase.middlegame.total,
		),
		middlegameAvgCpLoss: avgCpLoss(
			byPhase.middlegame.cpLossSum,
			byPhase.middlegame.total,
		),
		middlegameMoveCount: byPhase.middlegame.total,
		endgameAccuracy: accuracy(byPhase.endgame.good, byPhase.endgame.total),
		endgameAvgCpLoss: avgCpLoss(
			byPhase.endgame.cpLossSum,
			byPhase.endgame.total,
		),
		endgameMoveCount: byPhase.endgame.total,
		pieceStats,
		conceptStats,
		explainedMoveCount,
	};
}

// ── Player Profile Aggregation ────────────────────────────────────────

export type GamePerformanceRow = GamePerformanceResult & {
	gameAnalysisId: string;
	gameId: string;
	playedAt: string;
	openingEco: string | null;
	openingName: string | null;
};

export type PlayerProfileResult = {
	gamesAnalyzed: number;
	totalMovesAnalyzed: number;
	overallAccuracy: number;
	overallAvgCpLoss: number;
	openingAccuracy: number | null;
	middlegameAccuracy: number | null;
	endgameAccuracy: number | null;
	pieceStats: PieceStats;
	openingStats: OpeningStats;
	categoryStats: CategoryStats | null;
	conceptStats: ConceptStats | null;
	totalExplainedMoves: number;
	recentAccuracy: number | null;
	olderAccuracy: number | null;
	weaknesses: Weakness[];
	studyRecommendations: StudyRecommendation[];
};

/**
 * Aggregate multiple game performance rows into a player profile.
 * Games should be sorted by playedAt descending (most recent first).
 */
export function aggregatePlayerProfile(
	rows: GamePerformanceRow[],
): PlayerProfileResult {
	if (rows.length === 0) {
		return emptyProfile();
	}

	// Weighted averages
	const overall = emptyBucket();
	const byPhase: Record<GamePhase, Bucket> = {
		opening: emptyBucket(),
		middlegame: emptyBucket(),
		endgame: emptyBucket(),
	};
	const byPiece: Record<string, Bucket> = {};
	const byOpening: Record<
		string,
		{
			name: string;
			good: number;
			total: number;
			cpLossSum: number;
			gameCount: number;
		}
	> = {};
	const allConcepts: Record<
		string,
		{ hit: number; miss: number; total: number }
	> = {};
	const byCategory: Record<string, Bucket> = {};
	let totalExplainedMoves = 0;

	for (const row of rows) {
		totalExplainedMoves += row.explainedMoveCount;
		// Overall — use move counts as weights
		const totalMoves =
			row.openingMoveCount + row.middlegameMoveCount + row.endgameMoveCount;

		overall.total += totalMoves;
		overall.good += Math.round((row.overallAccuracy / 100) * totalMoves);
		overall.cpLossSum += row.overallAvgCpLoss * totalMoves;

		// By phase
		for (const phase of ["opening", "middlegame", "endgame"] as GamePhase[]) {
			const mc = row[`${phase}MoveCount`] as number;
			const acc = row[`${phase}Accuracy`] as number | null;
			const cpL = row[`${phase}AvgCpLoss`] as number | null;
			if (mc > 0 && acc !== null) {
				byPhase[phase].total += mc;
				byPhase[phase].good += Math.round((acc / 100) * mc);
				byPhase[phase].cpLossSum += (cpL ?? 0) * mc;
			}
		}

		// By piece
		for (const [piece, stats] of Object.entries(row.pieceStats)) {
			if (!byPiece[piece]) byPiece[piece] = emptyBucket();
			byPiece[piece].total += stats.moveCount;
			byPiece[piece].good += Math.round(
				(stats.accuracy / 100) * stats.moveCount,
			);
			byPiece[piece].cpLossSum += stats.avgCpLoss * stats.moveCount;
		}

		// By opening
		if (row.openingEco && row.openingMoveCount > 0) {
			const eco = row.openingEco;
			if (!byOpening[eco]) {
				byOpening[eco] = {
					name: row.openingName ?? eco,
					good: 0,
					total: 0,
					cpLossSum: 0,
					gameCount: 0,
				};
			}
			const o = byOpening[eco];
			o.gameCount++;
			o.total += totalMoves;
			o.good += Math.round((row.overallAccuracy / 100) * totalMoves);
			o.cpLossSum += row.overallAvgCpLoss * totalMoves;
		}

		// Concepts
		if (row.conceptStats) {
			for (const [conceptId, stats] of Object.entries(row.conceptStats)) {
				if (!allConcepts[conceptId]) {
					allConcepts[conceptId] = { hit: 0, miss: 0, total: 0 };
				}
				allConcepts[conceptId].hit += stats.hitCount;
				allConcepts[conceptId].miss += stats.missCount;
				allConcepts[conceptId].total += stats.total;

				// Aggregate by category
				const dim = getDimensionForConcept(conceptId);
				if (dim) {
					if (!byCategory[dim]) byCategory[dim] = emptyBucket();
					byCategory[dim].total += stats.total;
					byCategory[dim].good += stats.hitCount;
				}
			}
		}
	}

	// Build piece stats
	const allPieces: ChessPiece[] = [
		"pawn",
		"knight",
		"bishop",
		"rook",
		"queen",
		"king",
	];
	const pieceStats = {} as PieceStats;
	for (const piece of allPieces) {
		const b = byPiece[piece] ?? emptyBucket();
		pieceStats[piece] = {
			accuracy: accuracy(b.good, b.total) ?? 0,
			avgCpLoss: avgCpLoss(b.cpLossSum, b.total) ?? 0,
			moveCount: b.total,
		};
	}

	// Build opening stats (top openings by game count)
	const openingStats: OpeningStats = {};
	const sortedOpenings = Object.entries(byOpening)
		.sort(([, a], [, b]) => b.gameCount - a.gameCount)
		.slice(0, 10);
	for (const [eco, o] of sortedOpenings) {
		openingStats[eco] = {
			name: o.name,
			accuracy: accuracy(o.good, o.total) ?? 0,
			avgCpLoss: avgCpLoss(o.cpLossSum, o.total) ?? 0,
			gameCount: o.gameCount,
			moveCount: o.total,
		};
	}

	// Category stats
	const categoryStats: CategoryStats | null =
		Object.keys(byCategory).length > 0
			? Object.fromEntries(
					Object.entries(byCategory).map(([k, b]) => [
						k,
						{ accuracy: accuracy(b.good, b.total) ?? 0, moveCount: b.total },
					]),
				)
			: null;

	// Concept stats
	const conceptStats: ConceptStats | null =
		Object.keys(allConcepts).length > 0
			? Object.fromEntries(
					Object.entries(allConcepts).map(([k, v]) => [
						k,
						{ hitCount: v.hit, missCount: v.miss, total: v.total },
					]),
				)
			: null;

	// Trends — last 20 games vs older
	const RECENT_COUNT = 20;
	const recentRows = rows.slice(0, RECENT_COUNT);
	const olderRows = rows.slice(RECENT_COUNT);

	const recentAccuracy = weightedAccuracy(recentRows);
	const olderAccuracy =
		olderRows.length > 0 ? weightedAccuracy(olderRows) : null;

	const overallAcc = accuracy(overall.good, overall.total) ?? 0;

	// Weakness detection
	const weaknesses = detectWeaknesses(overallAcc, byPhase, byPiece);
	const studyRecommendations = generateRecommendations(weaknesses);

	return {
		gamesAnalyzed: rows.length,
		totalMovesAnalyzed: overall.total,
		overallAccuracy: overallAcc,
		overallAvgCpLoss: avgCpLoss(overall.cpLossSum, overall.total) ?? 0,
		openingAccuracy: accuracy(byPhase.opening.good, byPhase.opening.total),
		middlegameAccuracy: accuracy(
			byPhase.middlegame.good,
			byPhase.middlegame.total,
		),
		endgameAccuracy: accuracy(byPhase.endgame.good, byPhase.endgame.total),
		pieceStats,
		openingStats,
		categoryStats,
		conceptStats,
		totalExplainedMoves,
		recentAccuracy,
		olderAccuracy,
		weaknesses,
		studyRecommendations,
	};
}

function weightedAccuracy(rows: GamePerformanceRow[]): number | null {
	let good = 0;
	let total = 0;
	for (const row of rows) {
		const mc =
			row.openingMoveCount + row.middlegameMoveCount + row.endgameMoveCount;
		good += Math.round((row.overallAccuracy / 100) * mc);
		total += mc;
	}
	return accuracy(good, total);
}

function emptyProfile(): PlayerProfileResult {
	const emptyPiece = { accuracy: 0, avgCpLoss: 0, moveCount: 0 };
	return {
		gamesAnalyzed: 0,
		totalMovesAnalyzed: 0,
		overallAccuracy: 0,
		overallAvgCpLoss: 0,
		openingAccuracy: null,
		middlegameAccuracy: null,
		endgameAccuracy: null,
		pieceStats: {
			pawn: emptyPiece,
			knight: emptyPiece,
			bishop: emptyPiece,
			rook: emptyPiece,
			queen: emptyPiece,
			king: emptyPiece,
		},
		openingStats: {},
		categoryStats: null,
		conceptStats: null,
		totalExplainedMoves: 0,
		recentAccuracy: null,
		olderAccuracy: null,
		weaknesses: [],
		studyRecommendations: [],
	};
}

// ── Weakness Detection ────────────────────────────────────────────────

const MIN_MOVES_FOR_WEAKNESS = 20;
const WEAKNESS_THRESHOLD_PCT = 10;

function detectWeaknesses(
	overallAccuracy: number,
	byPhase: Record<GamePhase, Bucket>,
	byPiece: Record<string, Bucket>,
): Weakness[] {
	const weaknesses: Weakness[] = [];

	// Check phases
	const phaseLabels: Record<GamePhase, string> = {
		opening: "Opening",
		middlegame: "Middlegame",
		endgame: "Endgame",
	};
	for (const [phase, bucket] of Object.entries(byPhase) as [
		GamePhase,
		Bucket,
	][]) {
		if (bucket.total < MIN_MOVES_FOR_WEAKNESS) continue;
		const acc = accuracy(bucket.good, bucket.total) ?? 0;
		const diff = overallAccuracy - acc;
		if (diff >= WEAKNESS_THRESHOLD_PCT) {
			weaknesses.push({
				dimension: "phase",
				key: phase,
				label: `${phaseLabels[phase]} play`,
				accuracy: acc,
				overallAccuracy,
				moveCount: bucket.total,
				severity: diff * bucket.total,
				description: `Your ${phaseLabels[phase].toLowerCase()} accuracy is ${acc}%, ${Math.round(diff)}% below your overall ${overallAccuracy}%.`,
				examples: [],
			});
		}
	}

	// Check pieces
	const pieceLabels: Record<string, string> = {
		pawn: "Pawn",
		knight: "Knight",
		bishop: "Bishop",
		rook: "Rook",
		queen: "Queen",
		king: "King",
	};
	for (const [piece, bucket] of Object.entries(byPiece)) {
		if (bucket.total < MIN_MOVES_FOR_WEAKNESS) continue;
		const acc = accuracy(bucket.good, bucket.total) ?? 0;
		const diff = overallAccuracy - acc;
		if (diff >= WEAKNESS_THRESHOLD_PCT) {
			weaknesses.push({
				dimension: "piece",
				key: piece,
				label: `${pieceLabels[piece] ?? piece} handling`,
				accuracy: acc,
				overallAccuracy,
				moveCount: bucket.total,
				severity: diff * bucket.total,
				description: `Your ${(pieceLabels[piece] ?? piece).toLowerCase()} moves are ${acc}% accurate, ${Math.round(diff)}% below your overall ${overallAccuracy}%.`,
				examples: [],
			});
		}
	}

	// Sort by severity (descending)
	weaknesses.sort((a, b) => b.severity - a.severity);

	return weaknesses.slice(0, 5);
}

// ── Study Recommendations ─────────────────────────────────────────────

const PHASE_TIPS: Record<string, string> = {
	opening:
		"Focus on learning opening principles: control the center, develop pieces, and castle early.",
	middlegame:
		"Study middlegame plans: piece coordination, pawn breaks, and creating threats.",
	endgame:
		"Practice endgame technique: king activity, pawn promotion, and basic theoretical positions.",
};

const PIECE_TIPS: Record<string, string> = {
	knight:
		"Study knight outposts, centralization, and fork patterns. Knights need stable squares to be effective.",
	bishop:
		"Work on bishop pair usage, diagonal control, and avoiding bad bishops trapped behind your own pawns.",
	rook: "Practice rook activation: open files, the seventh rank, and rook lifts. Connect your rooks early.",
	queen:
		"Avoid premature queen development. Study how to use the queen in coordination with other pieces.",
	pawn: "Study pawn structures: isolated pawns, pawn chains, pawn breaks, and passed pawns.",
	king: "Improve king safety awareness in the middlegame and king activity in the endgame.",
};

function generateRecommendations(
	weaknesses: Weakness[],
): StudyRecommendation[] {
	return weaknesses.slice(0, 3).map((w) => {
		let description: string;
		if (w.dimension === "phase") {
			description =
				PHASE_TIPS[w.key] ??
				`Focus on improving your ${w.label.toLowerCase()}.`;
		} else if (w.dimension === "piece") {
			description =
				PIECE_TIPS[w.key] ??
				`Focus on improving your ${w.label.toLowerCase()}.`;
		} else {
			description = `Focus on improving your ${w.label.toLowerCase()}.`;
		}

		return {
			title: `Improve ${w.label.toLowerCase()}`,
			description,
			weakness: w.key,
		};
	});
}

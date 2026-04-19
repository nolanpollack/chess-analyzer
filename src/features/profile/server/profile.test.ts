import { describe, expect, it, vi } from "vitest";

vi.mock("#/db/index", () => ({
	db: {},
}));

import {
	__profileDrilldownTestUtils,
	type DimensionDrilldownData,
	type DimensionType,
	type DrilldownTaggedMoveRow,
} from "#/features/profile/server/profile";

describe("profile drilldown helpers", () => {
	it("phase drilldown includes piece/concept/opening and omits phase", () => {
		const data = buildDrilldown("phase", "middlegame");

		expect(data.byPiece).toBeDefined();
		expect(data.byConcept).toBeDefined();
		expect(data.byOpening).toBeDefined();
		expect(data.byPhase).toBeUndefined();
	});

	it("piece drilldown includes phase/concept/opening and omits piece", () => {
		const data = buildDrilldown("piece", "knight");

		expect(data.byPhase).toBeDefined();
		expect(data.byConcept).toBeDefined();
		expect(data.byOpening).toBeDefined();
		expect(data.byPiece).toBeUndefined();
	});

	it("orders examples by worst eval delta first", () => {
		const data = buildDrilldown("phase", "middlegame");
		const evalDeltas = data.examples.map((example) => example.evalDelta);
		expect(evalDeltas).toEqual([...evalDeltas].sort((a, b) => a - b));
	});

	it("uses only explained moves for concept stats", () => {
		const data = buildDrilldown("phase", "middlegame");

		expect(data.conceptSampleSize).toBe(2);
		expect(data.byConcept.length).toBeGreaterThan(0);
		expect(data.byConcept[0].totalCount).toBeGreaterThan(0);
	});

	it("returns empty-safe data for empty dimension result", () => {
		const data = __profileDrilldownTestUtils.emptyDrilldownData(
			"phase",
			"middlegame",
		);

		expect(data.primary.moveCount).toBe(0);
		expect(data.examples).toHaveLength(0);
		expect(data.byConcept).toHaveLength(0);
	});
});

function buildDrilldown(
	dimension: DimensionType,
	value: string,
): DimensionDrilldownData {
	const moves = __profileDrilldownTestUtils.filterTaggedMovesByDimension(
		sampleMoves(),
		dimension,
		value,
	);

	return __profileDrilldownTestUtils.buildDimensionDrilldownData({
		dimension,
		value,
		moves,
		profile: sampleProfile(),
	});
}

function sampleMoves(): DrilldownTaggedMoveRow[] {
	return [
		createMove({
			gameId: "g1",
			phase: "middlegame",
			pieces: ["knight"],
			concepts: ["piece-coordination"],
			evalDelta: -220,
			classification: "blunder",
			ply: 24,
			gameOpeningEco: "B20",
			gameOpeningName: "Sicilian Defense",
		}),
		createMove({
			gameId: "g1",
			phase: "middlegame",
			pieces: ["pawn"],
			concepts: ["king-safety"],
			evalDelta: -120,
			classification: "mistake",
			ply: 26,
			gameOpeningEco: "B20",
			gameOpeningName: "Sicilian Defense",
		}),
		createMove({
			gameId: "g2",
			phase: "middlegame",
			pieces: ["knight"],
			concepts: [],
			evalDelta: -45,
			classification: "inaccuracy",
			ply: 18,
			gameOpeningEco: "C50",
			gameOpeningName: "Italian Game",
		}),
		createMove({
			gameId: "g2",
			phase: "opening",
			pieces: ["bishop"],
			concepts: ["development"],
			evalDelta: 25,
			classification: "good",
			ply: 8,
			gameOpeningEco: "C50",
			gameOpeningName: "Italian Game",
		}),
	];
}

function createMove(
	overrides: Partial<DrilldownTaggedMoveRow>,
): DrilldownTaggedMoveRow {
	return {
		gameId: overrides.gameId ?? "g1",
		gameAnalysisId: overrides.gameAnalysisId ?? "ga1",
		playedAt: overrides.playedAt ?? "2025-01-01T00:00:00.000Z",
		opponentUsername: overrides.opponentUsername ?? "opponent",
		gameOpeningEco: overrides.gameOpeningEco ?? "B20",
		gameOpeningName: overrides.gameOpeningName ?? "Sicilian Defense",
		phase: overrides.phase ?? "middlegame",
		pieces: overrides.pieces ?? ["knight"],
		concepts: overrides.concepts ?? [],
		ply: overrides.ply ?? 1,
		classification: overrides.classification ?? "good",
		evalDelta: overrides.evalDelta ?? 0,
		moveSan: overrides.moveSan ?? "Nf3",
	};
}

function sampleProfile() {
	return {
		id: "p1",
		playerId: "player-1",
		gamesAnalyzed: 20,
		totalMovesAnalyzed: 500,
		overallAccuracy: 60,
		overallAvgCpLoss: 55,
		openingAccuracy: 62,
		middlegameAccuracy: 54,
		endgameAccuracy: 66,
		pieceStats: {
			pawn: { accuracy: 58, avgCpLoss: 50, moveCount: 120 },
			knight: { accuracy: 47, avgCpLoss: 75, moveCount: 90 },
			bishop: { accuracy: 63, avgCpLoss: 45, moveCount: 80 },
			rook: { accuracy: 67, avgCpLoss: 40, moveCount: 70 },
			queen: { accuracy: 61, avgCpLoss: 50, moveCount: 60 },
			king: { accuracy: 65, avgCpLoss: 42, moveCount: 40 },
		},
		openingStats: {},
		categoryStats: {
			tactical: { accuracy: 52, moveCount: 40 },
			positional: { accuracy: 61, moveCount: 30 },
			strategic: { accuracy: 57, moveCount: 35 },
			endgame: { accuracy: 66, moveCount: 20 },
		},
		conceptStats: null,
		totalExplainedMoves: 50,
		recentAccuracy: 58,
		olderAccuracy: 56,
		weaknesses: [],
		studyRecommendations: [],
		computedAt: new Date(),
	};
}

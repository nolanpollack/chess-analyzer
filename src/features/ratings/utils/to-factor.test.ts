import { describe, expect, test } from "vitest";
import type { DimensionScore } from "#/features/ratings/server/queries";
import {
	confidenceFromSampleSize,
	toFactor,
} from "#/features/ratings/utils/to-factor";

function score(overrides: Partial<DimensionScore>): DimensionScore {
	return {
		dimensionType: "phase",
		dimensionValue: "endgame",
		rawAccuracy: 75,
		adjustedAccuracy: 73,
		sampleSize: 30,
		ratingEstimate: 1720,
		...overrides,
	};
}

describe("confidenceFromSampleSize", () => {
	test("≥50 → high", () => {
		expect(confidenceFromSampleSize(50)).toBe("high");
		expect(confidenceFromSampleSize(200)).toBe("high");
	});
	test("20–49 → medium", () => {
		expect(confidenceFromSampleSize(20)).toBe("medium");
		expect(confidenceFromSampleSize(49)).toBe("medium");
	});
	test("<20 → low", () => {
		expect(confidenceFromSampleSize(19)).toBe("low");
		expect(confidenceFromSampleSize(0)).toBe("low");
	});
});

describe("toFactor", () => {
	test("maps phase score to a Factor with display label and group", () => {
		const f = toFactor(
			score({ dimensionType: "phase", dimensionValue: "endgame" }),
		);
		expect(f.label).toBe("Endgame");
		expect(f.group).toBe("phase");
		expect(f.id).toBe("phase:endgame");
		expect(f.value).toBe(1720);
	});

	test("maps piece score with capitalized label", () => {
		const f = toFactor(
			score({ dimensionType: "piece", dimensionValue: "knight" }),
		);
		expect(f.label).toBe("Knight");
		expect(f.group).toBe("piece");
	});

	test("maps agency score", () => {
		const f = toFactor(
			score({ dimensionType: "agency", dimensionValue: "forcing" }),
		);
		expect(f.label).toBe("Forcing");
		expect(f.group).toBe("agency");
	});

	test("maps concept id to its taxonomy display name", () => {
		const f = toFactor(
			score({ dimensionType: "concept", dimensionValue: "hanging-piece" }),
		);
		expect(f.label).toBe("Hanging piece");
		expect(f.group).toBe("concept");
	});

	test("derives confidence from sampleSize", () => {
		expect(toFactor(score({ sampleSize: 5 })).confidence).toBe("low");
		expect(toFactor(score({ sampleSize: 25 })).confidence).toBe("medium");
		expect(toFactor(score({ sampleSize: 100 })).confidence).toBe("high");
	});

	test("delta and trend are zero/empty until historical data lands", () => {
		const f = toFactor(score({}));
		expect(f.delta).toBe(0);
		expect(f.trend).toEqual([]);
	});
});

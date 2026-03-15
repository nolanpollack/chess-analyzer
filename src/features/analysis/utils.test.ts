import { describe, expect, it } from "vitest";
import {
	extractMateIn,
	formatEval,
	formatEvalDisplay,
	formatMateScore,
	isMateScore,
} from "./utils";

describe("formatEval", () => {
	it("formats positive eval with + sign", () => {
		expect(formatEval(150)).toBe("+1.5");
	});

	it("formats negative eval with - sign", () => {
		expect(formatEval(-230)).toBe("-2.3");
	});

	it("formats zero eval without sign", () => {
		expect(formatEval(0)).toBe("0.0");
	});

	it("formats small values correctly", () => {
		expect(formatEval(5)).toBe("+0.1");
		expect(formatEval(-5)).toBe("-0.1");
	});

	it("clamps values when clamp is provided", () => {
		expect(formatEval(2000, 1500)).toBe("+15.0");
		expect(formatEval(-2000, 1500)).toBe("-15.0");
	});

	it("does not clamp values within range", () => {
		expect(formatEval(500, 1500)).toBe("+5.0");
	});
});

describe("formatMateScore", () => {
	it("formats positive mate-in-N", () => {
		expect(formatMateScore(3)).toBe("M3");
	});

	it("formats negative mate-in-N (being mated)", () => {
		expect(formatMateScore(-5)).toBe("-M5");
	});

	it("formats mate in 1", () => {
		expect(formatMateScore(1)).toBe("M1");
		expect(formatMateScore(-1)).toBe("-M1");
	});
});

describe("isMateScore", () => {
	it("returns true for large positive values", () => {
		expect(isMateScore(99997)).toBe(true);
	});

	it("returns true for large negative values", () => {
		expect(isMateScore(-99995)).toBe(true);
	});

	it("returns false for normal centipawn values", () => {
		expect(isMateScore(500)).toBe(false);
		expect(isMateScore(-1000)).toBe(false);
		expect(isMateScore(0)).toBe(false);
	});

	it("returns true at exactly 90000", () => {
		expect(isMateScore(90000)).toBe(true);
		expect(isMateScore(-90000)).toBe(true);
	});

	it("returns false at 89999", () => {
		expect(isMateScore(89999)).toBe(false);
	});
});

describe("extractMateIn", () => {
	it("extracts mate-in-3 from positive cp", () => {
		// cp = 100000 - N → N = 100000 - cp
		expect(extractMateIn(99997)).toBe(3);
	});

	it("extracts mate-in-5 from negative cp (being mated)", () => {
		// cp = -(100000 - N) = -99995 → N = -(100000 + cp) = -(100000 - 99995) = -5
		expect(extractMateIn(-99995)).toBe(-5);
	});

	it("extracts mate-in-1", () => {
		expect(extractMateIn(99999)).toBe(1);
		expect(extractMateIn(-99999)).toBe(-1);
	});
});

describe("formatEvalDisplay", () => {
	it("formats normal centipawn eval", () => {
		expect(formatEvalDisplay(150)).toBe("+1.5");
		expect(formatEvalDisplay(-300)).toBe("-3.0");
	});

	it("formats mate scores", () => {
		expect(formatEvalDisplay(99997)).toBe("M3");
		expect(formatEvalDisplay(-99995)).toBe("-M5");
	});

	it("applies clamp for normal evals", () => {
		expect(formatEvalDisplay(2000, 1500)).toBe("+15.0");
	});

	it("does not clamp mate scores (they bypass clamp)", () => {
		// Mate scores are handled by isMateScore before clamping
		expect(formatEvalDisplay(99997, 1500)).toBe("M3");
	});

	it("formats zero", () => {
		expect(formatEvalDisplay(0)).toBe("0.0");
	});
});

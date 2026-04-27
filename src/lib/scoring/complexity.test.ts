import { describe, expect, it } from "vitest";
import { cpToWinPct } from "#/lib/analysis/accuracy";
import { moveComplexity } from "./complexity";

describe("moveComplexity", () => {
	it("returns 0 when pv2 is null (only one legal move)", () => {
		expect(moveComplexity(200, null)).toBe(0);
	});

	it("returns 0 when pv1 and pv2 are equal (both moves equally good)", () => {
		expect(moveComplexity(0, 0)).toBe(0);
	});

	it("returns a positive value when pv1 is better than pv2", () => {
		// pv1 = +200cp, pv2 = 0cp — meaningful gap
		const result = moveComplexity(200, 0);
		const expected = cpToWinPct(200) - cpToWinPct(0);
		expect(result).toBeCloseTo(expected, 4);
		expect(result).toBeGreaterThan(0);
	});

	it("clamps to 50 for extreme gaps", () => {
		// pv1 = forced mate (huge), pv2 = 0cp
		expect(moveComplexity(100000, 0)).toBe(50);
	});

	it("clamps to 0 for negative gaps (should not happen in practice)", () => {
		// pv2 > pv1 should be impossible, but guard against it
		expect(moveComplexity(0, 200)).toBe(0);
	});

	it("produces values in [0, 50] for typical middlegame positions", () => {
		// Balanced position: pv1 = +50cp, pv2 = +20cp
		const result = moveComplexity(50, 20);
		expect(result).toBeGreaterThanOrEqual(0);
		expect(result).toBeLessThanOrEqual(50);
	});

	it("produces higher complexity for larger gaps", () => {
		const small = moveComplexity(100, 90);
		const large = moveComplexity(200, 0);
		expect(large).toBeGreaterThan(small);
	});
});

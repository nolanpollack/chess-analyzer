import { describe, expect, it } from "vitest";
import { applyShrinkage } from "./shrinkage";

describe("applyShrinkage", () => {
	it("returns prior when sample size is zero", () => {
		expect(applyShrinkage({ raw: 90, sampleSize: 0, prior: 70, k: 50 })).toBe(
			70,
		);
	});

	it("returns raw when k is zero and n > 0", () => {
		expect(applyShrinkage({ raw: 90, sampleSize: 10, prior: 70, k: 0 })).toBe(
			90,
		);
	});

	it("blends raw and prior with weight n/(n+k)", () => {
		// n = 50, k = 50 → exactly halfway
		expect(applyShrinkage({ raw: 90, sampleSize: 50, prior: 70, k: 50 })).toBe(
			80,
		);
	});

	it("approaches raw as sample grows", () => {
		const result = applyShrinkage({
			raw: 90,
			sampleSize: 1000,
			prior: 70,
			k: 50,
		});
		expect(result).toBeGreaterThan(89);
		expect(result).toBeLessThan(90);
	});

	it("approaches prior with very small samples", () => {
		const result = applyShrinkage({
			raw: 90,
			sampleSize: 1,
			prior: 70,
			k: 50,
		});
		expect(result).toBeLessThan(72);
		expect(result).toBeGreaterThan(70);
	});

	it("handles raw == prior identically regardless of n", () => {
		expect(applyShrinkage({ raw: 75, sampleSize: 0, prior: 75, k: 50 })).toBe(
			75,
		);
		expect(applyShrinkage({ raw: 75, sampleSize: 200, prior: 75, k: 50 })).toBe(
			75,
		);
	});

	it("rejects negative k", () => {
		expect(() =>
			applyShrinkage({ raw: 1, sampleSize: 1, prior: 1, k: -1 }),
		).toThrow();
	});

	it("rejects negative sampleSize", () => {
		expect(() =>
			applyShrinkage({ raw: 1, sampleSize: -1, prior: 1, k: 1 }),
		).toThrow();
	});
});

import { describe, expect, it } from "vitest";
import { bandFor, bandIndexFor, RATING_BANDS } from "./rating-bands";

describe("bandIndexFor", () => {
	it("returns correct band for boundary values", () => {
		expect(bandIndexFor(999)).toBe(0); // <1000
		expect(bandIndexFor(1000)).toBe(1); // 1000-1200
		expect(bandIndexFor(1199)).toBe(1);
		expect(bandIndexFor(1200)).toBe(2); // 1200-1400
		expect(bandIndexFor(2399)).toBe(7); // 2200-2400
		expect(bandIndexFor(2400)).toBe(8); // ≥2400
		expect(bandIndexFor(3000)).toBe(8);
	});

	it("returns -1 for negative rating", () => {
		expect(bandIndexFor(-1)).toBe(-1);
	});

	it("returns 0 for rating 0", () => {
		expect(bandIndexFor(0)).toBe(0);
	});
});

describe("bandFor", () => {
	it("returns correct label strings", () => {
		expect(bandFor(500)).toBe("<1000");
		expect(bandFor(1500)).toBe("1400-1600");
		expect(bandFor(2500)).toBe("≥2400");
	});

	it("returns unknown for out-of-range", () => {
		expect(bandFor(-1)).toBe("unknown");
	});
});

describe("RATING_BANDS", () => {
	it("has 9 bands", () => {
		expect(RATING_BANDS).toHaveLength(9);
	});

	it("bands are contiguous", () => {
		for (let i = 1; i < RATING_BANDS.length - 1; i++) {
			expect(RATING_BANDS[i].low).toBe(RATING_BANDS[i - 1].high + 1);
		}
	});
});

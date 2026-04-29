import { describe, expect, it } from "vitest";
import { applyEvalFilters, classifyTimeControl } from "./filter";

describe("classifyTimeControl", () => {
	it("classifies blitz (5+0)", () => {
		expect(classifyTimeControl("300+0")).toBe("blitz");
	});

	it("classifies rapid (10+0)", () => {
		expect(classifyTimeControl("600+0")).toBe("rapid");
	});

	it("returns null for bullet (1+0)", () => {
		expect(classifyTimeControl("60+0")).toBeNull();
	});

	it("returns null for classical (30+0)", () => {
		expect(classifyTimeControl("1800+0")).toBeNull();
	});

	it("returns null for invalid format", () => {
		expect(classifyTimeControl("600")).toBeNull();
		expect(classifyTimeControl("abc+def")).toBeNull();
	});

	it("accounts for increment in effective time", () => {
		// 3+2: base=180 + 40*2=80 -> 260 = blitz
		expect(classifyTimeControl("180+2")).toBe("blitz");
		// 5+5: base=300 + 40*5=200 -> 500 = rapid
		expect(classifyTimeControl("300+5")).toBe("rapid");
	});
});

describe("applyEvalFilters", () => {
	const validHeaders = {
		Rated: "true",
		WhiteElo: "1500",
		BlackElo: "1600",
		TimeControl: "300+0",
	};

	it("accepts a valid standard game", () => {
		expect(applyEvalFilters(validHeaders, 20)).toBe(true);
	});

	it("accepts when Variant is absent (standard on Lichess)", () => {
		expect(applyEvalFilters(validHeaders, 20)).toBe(true);
	});

	it("accepts when Variant is Standard", () => {
		expect(applyEvalFilters({ ...validHeaders, Variant: "Standard" }, 20)).toBe(
			true,
		);
	});

	it("rejects non-standard variant", () => {
		expect(applyEvalFilters({ ...validHeaders, Variant: "Chess960" }, 20)).toBe(
			false,
		);
	});

	it("rejects unrated games", () => {
		expect(applyEvalFilters({ ...validHeaders, Rated: "false" }, 20)).toBe(
			false,
		);
	});

	it("rejects when Rated header is missing", () => {
		const { Rated: _, ...rest } = validHeaders;
		expect(applyEvalFilters(rest, 20)).toBe(false);
	});

	it("rejects when WhiteElo is missing", () => {
		const { WhiteElo: _, ...rest } = validHeaders;
		expect(applyEvalFilters(rest, 20)).toBe(false);
	});

	it("rejects when BlackElo is below 600", () => {
		expect(applyEvalFilters({ ...validHeaders, BlackElo: "550" }, 20)).toBe(
			false,
		);
	});

	it("rejects bullet time control", () => {
		expect(applyEvalFilters({ ...validHeaders, TimeControl: "60+0" }, 20)).toBe(
			false,
		);
	});

	it("rejects games with fewer than 10 plies", () => {
		expect(applyEvalFilters(validHeaders, 9)).toBe(false);
	});

	it("accepts games with exactly 10 plies", () => {
		expect(applyEvalFilters(validHeaders, 10)).toBe(true);
	});
});

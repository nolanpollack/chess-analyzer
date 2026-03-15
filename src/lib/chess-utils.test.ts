import { describe, expect, it } from "vitest";
import {
	classifyResult,
	lookupOpeningName,
	parseOpeningFromPgn,
} from "./chess-utils";

describe("classifyResult", () => {
	it("classifies 'win' as win", () => {
		expect(classifyResult("win")).toBe("win");
	});

	it.each([
		"checkmated",
		"timeout",
		"resigned",
		"lose",
		"abandoned",
	])("classifies '%s' as loss", (code) => {
		expect(classifyResult(code)).toBe("loss");
	});

	it.each([
		"stalemate",
		"insufficient",
		"repetition",
		"agreed",
		"timevsinsufficient",
		"50move",
	])("classifies '%s' as draw", (code) => {
		expect(classifyResult(code)).toBe("draw");
	});

	it("throws on unknown result code", () => {
		expect(() => classifyResult("unknown_code")).toThrow(
			'Unknown chess.com result code: "unknown_code"',
		);
	});
});

describe("lookupOpeningName", () => {
	it("returns the base opening name for a known ECO code", () => {
		expect(lookupOpeningName("B20")).toBe("Sicilian Defense");
		expect(lookupOpeningName("C69")).toBe("Ruy Lopez: Exchange Variation");
	});

	it("returns null for unknown ECO codes", () => {
		expect(lookupOpeningName("Z99")).toBeNull();
	});
});

describe("parseOpeningFromPgn", () => {
	it("extracts ECO and opening name from [Opening] header when present", () => {
		const pgn = `[ECO "B20"]
[Opening "Sicilian Defense"]

1. e4 c5 *`;

		const result = parseOpeningFromPgn(pgn);
		expect(result.eco).toBe("B20");
		expect(result.name).toBe("Sicilian Defense");
	});

	it("falls back to ECO dataset lookup when [Opening] header is absent (real chess.com format)", () => {
		const pgn = `[Event "Live Chess"]
[Site "Chess.com"]
[ECO "B20"]

1. e4 c5 *`;

		const result = parseOpeningFromPgn(pgn);
		expect(result.eco).toBe("B20");
		expect(result.name).toBe("Sicilian Defense");
	});

	it("returns null name for PGN without ECO or Opening headers", () => {
		const pgn = `[Event "Live Chess"]
[Variant "Chess960"]

1. e4 e5 *`;

		const result = parseOpeningFromPgn(pgn);
		expect(result.eco).toBeNull();
		expect(result.name).toBeNull();
	});

	it("[Opening] header takes precedence over ECO dataset", () => {
		const pgn = `[ECO "C50"]
[Opening "Italian Game: Giuoco Pianissimo, Normal"]

1. e4 e5 *`;

		const result = parseOpeningFromPgn(pgn);
		expect(result.eco).toBe("C50");
		expect(result.name).toBe("Italian Game: Giuoco Pianissimo, Normal");
	});

	it("returns null name for unknown ECO with no Opening header", () => {
		const pgn = `[ECO "Z99"]

1. g4 *`;

		const result = parseOpeningFromPgn(pgn);
		expect(result.eco).toBe("Z99");
		expect(result.name).toBeNull();
	});
});

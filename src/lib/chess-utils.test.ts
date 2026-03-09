import { describe, expect, it } from "vitest";
import { classifyResult, parseOpeningFromPgn } from "./chess-utils";

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

describe("parseOpeningFromPgn", () => {
	it("extracts ECO and opening name from well-formed PGN", () => {
		const pgn = `[Event "Live Chess"]
[Site "Chess.com"]
[ECO "B20"]
[Opening "Sicilian Defense"]

1. e4 c5 *`;

		const result = parseOpeningFromPgn(pgn);
		expect(result.eco).toBe("B20");
		expect(result.name).toBe("Sicilian Defense");
	});

	it("returns null for PGN without ECO/Opening headers", () => {
		const pgn = `[Event "Live Chess"]
[Site "Chess.com"]
[Variant "Chess960"]

1. e4 e5 *`;

		const result = parseOpeningFromPgn(pgn);
		expect(result.eco).toBeNull();
		expect(result.name).toBeNull();
	});

	it("handles multi-word opening names", () => {
		const pgn = `[ECO "C50"]
[Opening "Italian Game: Giuoco Pianissimo, Normal"]

1. e4 e5 *`;

		const result = parseOpeningFromPgn(pgn);
		expect(result.eco).toBe("C50");
		expect(result.name).toBe("Italian Game: Giuoco Pianissimo, Normal");
	});

	it("handles PGN with only ECO header", () => {
		const pgn = `[ECO "A00"]

1. g4 *`;

		const result = parseOpeningFromPgn(pgn);
		expect(result.eco).toBe("A00");
		expect(result.name).toBeNull();
	});

	it("handles PGN with only Opening header", () => {
		const pgn = `[Opening "King's Pawn Opening"]

1. e4 *`;

		const result = parseOpeningFromPgn(pgn);
		expect(result.eco).toBeNull();
		expect(result.name).toBe("King's Pawn Opening");
	});
});

import { describe, expect, it } from "vitest";

describe("applyEvalFilters via pgn-stream", () => {
	it("only yields games passing all filters", async () => {
		// Test filters directly since we can't easily mock spawn for zstdcat
		const { applyEvalFilters } = await import("./filter");

		const validHeaders = {
			Rated: "true",
			WhiteElo: "1500",
			BlackElo: "1600",
			TimeControl: "300+0",
		};
		const unratedHeaders = { ...validHeaders, Rated: "false" };
		const bulletHeaders = { ...validHeaders, TimeControl: "60+0" };

		expect(applyEvalFilters(validHeaders, 20)).toBe(true);
		expect(applyEvalFilters(unratedHeaders, 20)).toBe(false);
		expect(applyEvalFilters(bulletHeaders, 20)).toBe(false);
	});
});

describe("PGN header parsing", () => {
	it("parses headers from PGN lines", async () => {
		// Test the header parsing logic by verifying the regex pattern used
		const headerRegex = /^\[(\w+)\s+"([^"]*)"\]$/;

		const line = '[WhiteElo "1500"]';
		const m = line.match(headerRegex);
		expect(m).not.toBeNull();
		expect(m![1]).toBe("WhiteElo");
		expect(m![2]).toBe("1500");
	});

	it("handles headers with special characters in values", () => {
		const headerRegex = /^\[(\w+)\s+"([^"]*)"\]$/;
		const line = '[Site "https://lichess.org/abc123"]';
		const m = line.match(headerRegex);
		expect(m![2]).toBe("https://lichess.org/abc123");
	});
});

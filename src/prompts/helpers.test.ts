import { describe, expect, it } from "vitest";
import {
	classificationDescription,
	formatEvalForPrompt,
	formatMoveSequence,
} from "./helpers";

describe("formatEvalForPrompt", () => {
	it("formats positive eval with + sign", () => {
		expect(formatEvalForPrompt(150)).toBe("+1.50");
	});

	it("formats negative eval with minus sign", () => {
		expect(formatEvalForPrompt(-230)).toBe("-2.30");
	});

	it("formats zero eval", () => {
		expect(formatEvalForPrompt(0)).toBe("0.00");
	});

	it("formats small positive eval", () => {
		expect(formatEvalForPrompt(5)).toBe("+0.05");
	});

	it("formats large eval", () => {
		expect(formatEvalForPrompt(1500)).toBe("+15.00");
	});

	it("formats single centipawn", () => {
		expect(formatEvalForPrompt(1)).toBe("+0.01");
	});
});

describe("formatMoveSequence", () => {
	it("returns '(none)' for empty array", () => {
		expect(formatMoveSequence([])).toBe("(none)");
	});

	it("formats a single white move with move number", () => {
		expect(formatMoveSequence([{ ply: 1, san: "e4" }])).toBe("1. e4");
	});

	it("formats a single black move with '...' notation", () => {
		expect(formatMoveSequence([{ ply: 2, san: "e5" }])).toBe("1... e5");
	});

	it("formats a sequence of white and black moves", () => {
		const moves = [
			{ ply: 1, san: "e4" },
			{ ply: 2, san: "e5" },
			{ ply: 3, san: "Nf3" },
		];
		expect(formatMoveSequence(moves)).toBe("1. e4 e5 2. Nf3");
	});

	it("formats mid-game moves with correct move numbers", () => {
		const moves = [
			{ ply: 43, san: "Nf3" },
			{ ply: 44, san: "Bg7" },
			{ ply: 45, san: "O-O" },
		];
		expect(formatMoveSequence(moves)).toBe("22. Nf3 Bg7 23. O-O");
	});

	it("starts with black move correctly mid-sequence", () => {
		const moves = [
			{ ply: 44, san: "Bg7" },
			{ ply: 45, san: "O-O" },
		];
		expect(formatMoveSequence(moves)).toBe("22... Bg7 23. O-O");
	});

	it("handles black move followed by next white move", () => {
		const moves = [
			{ ply: 2, san: "d5" },
			{ ply: 3, san: "Nc3" },
			{ ply: 4, san: "Nf6" },
		];
		expect(formatMoveSequence(moves)).toBe("1... d5 2. Nc3 Nf6");
	});
});

describe("classificationDescription", () => {
	it("describes 'brilliant'", () => {
		const desc = classificationDescription("brilliant");
		expect(desc).toContain("brilliant");
	});

	it("describes 'best'", () => {
		const desc = classificationDescription("best");
		expect(desc).toContain("best move");
	});

	it("describes 'good'", () => {
		const desc = classificationDescription("good");
		expect(desc).toContain("good move");
	});

	it("describes 'inaccuracy'", () => {
		const desc = classificationDescription("inaccuracy");
		expect(desc).toContain("inaccuracy");
	});

	it("describes 'mistake'", () => {
		const desc = classificationDescription("mistake");
		expect(desc).toContain("mistake");
	});

	it("describes 'blunder'", () => {
		const desc = classificationDescription("blunder");
		expect(desc).toContain("blunder");
	});

	it("handles unknown classification gracefully", () => {
		const desc = classificationDescription("unknown");
		expect(desc).toContain("unknown");
	});
});

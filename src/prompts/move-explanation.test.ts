import { describe, expect, it } from "vitest";
import type { MoveExplanationContext } from "./move-explanation";
import { buildMoveExplanationPrompt, PROMPT_VERSION } from "./move-explanation";

function makeContext(
	overrides: Partial<MoveExplanationContext> = {},
): MoveExplanationContext {
	return {
		playerRating: 1400,
		playerColor: "white",
		gamePhase: "middlegame",
		fenBefore: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
		movePlayed: "Nf6",
		bestMove: "e5",
		evalBefore: 50,
		evalAfter: -20,
		evalDelta: -70,
		classification: "inaccuracy",
		isPlayerMove: true,
		movesBefore: [
			{ ply: 1, san: "e4" },
			{ ply: 2, san: "e5" },
		],
		movesAfter: [
			{ ply: 5, san: "Nc3" },
			{ ply: 6, san: "Bb4" },
		],
		...overrides,
	};
}

describe("PROMPT_VERSION", () => {
	it("is a non-empty string starting with 'move-explanation-'", () => {
		expect(PROMPT_VERSION).toBeDefined();
		expect(PROMPT_VERSION.startsWith("move-explanation-")).toBe(true);
	});
});

describe("buildMoveExplanationPrompt", () => {
	it("includes the player rating and rating band", () => {
		const prompt = buildMoveExplanationPrompt(
			makeContext({ playerRating: 1400 }),
		);
		expect(prompt).toContain("1400");
		expect(prompt).toContain("club-level");
	});

	it("uses beginner band for low ratings", () => {
		const prompt = buildMoveExplanationPrompt(
			makeContext({ playerRating: 600 }),
		);
		expect(prompt).toContain("beginner");
		expect(prompt).toContain("avoid jargon");
	});

	it("uses intermediate band for 800-1200 ratings", () => {
		const prompt = buildMoveExplanationPrompt(
			makeContext({ playerRating: 1000 }),
		);
		expect(prompt).toContain("intermediate");
	});

	it("uses advanced band for 1600-2000 ratings", () => {
		const prompt = buildMoveExplanationPrompt(
			makeContext({ playerRating: 1800 }),
		);
		expect(prompt).toContain("advanced");
	});

	it("uses expert band for 2000+ ratings", () => {
		const prompt = buildMoveExplanationPrompt(
			makeContext({ playerRating: 2200 }),
		);
		expect(prompt).toContain("expert");
	});

	it("includes the FEN, game phase, and player color", () => {
		const ctx = makeContext({
			gamePhase: "endgame",
			playerColor: "black",
		});
		const prompt = buildMoveExplanationPrompt(ctx);
		expect(prompt).toContain(ctx.fenBefore);
		expect(prompt).toContain("endgame");
		expect(prompt).toContain("black");
	});

	it("includes move played and best move when different", () => {
		const prompt = buildMoveExplanationPrompt(
			makeContext({ movePlayed: "Nf6", bestMove: "e5" }),
		);
		expect(prompt).toContain("Nf6");
		expect(prompt).toContain("e5");
		expect(prompt).toContain("Best move according to engine");
	});

	it("notes when the move matches the engine recommendation", () => {
		const prompt = buildMoveExplanationPrompt(
			makeContext({
				movePlayed: "e4",
				bestMove: "e4",
				classification: "best",
			}),
		);
		expect(prompt).toContain("matches the engine's recommendation");
		expect(prompt).not.toContain("Best move according to engine");
	});

	it("includes formatted eval values", () => {
		const prompt = buildMoveExplanationPrompt(
			makeContext({
				evalBefore: 150,
				evalAfter: -50,
				evalDelta: -200,
			}),
		);
		expect(prompt).toContain("+1.50");
		expect(prompt).toContain("-0.50");
		expect(prompt).toContain("-2.00");
	});

	it("notes when the move involves a capture", () => {
		const prompt = buildMoveExplanationPrompt(
			makeContext({ movePlayed: "Nxe5" }),
		);
		expect(prompt).toContain("capture");
	});

	it("includes preceding and following move context", () => {
		const prompt = buildMoveExplanationPrompt(
			makeContext({
				movesBefore: [
					{ ply: 1, san: "e4" },
					{ ply: 2, san: "e5" },
				],
				movesAfter: [{ ply: 5, san: "Nc3" }],
			}),
		);
		expect(prompt).toContain("1. e4 e5");
		expect(prompt).toContain("3. Nc3");
	});

	it("includes concept taxonomy section", () => {
		const prompt = buildMoveExplanationPrompt(makeContext());
		expect(prompt).toContain("Concept taxonomy");
		expect(prompt).toContain("Tactical:");
		expect(prompt).toContain("Positional:");
		expect(prompt).toContain("Strategic:");
		expect(prompt).toContain("Endgame:");
		expect(prompt).toContain("fork");
		expect(prompt).toContain("pawn-structure");
	});

	it("includes different guidance for opponent moves", () => {
		const prompt = buildMoveExplanationPrompt(
			makeContext({ isPlayerMove: false }),
		);
		expect(prompt).toContain("opponent's move");
	});

	it("includes different guidance for blunders", () => {
		const prompt = buildMoveExplanationPrompt(
			makeContext({ classification: "blunder", isPlayerMove: true }),
		);
		expect(prompt).toContain("blunder");
		expect(prompt).toContain("serious error");
	});

	it("includes different guidance for best moves", () => {
		const prompt = buildMoveExplanationPrompt(
			makeContext({
				classification: "best",
				movePlayed: "e4",
				bestMove: "e4",
				isPlayerMove: true,
			}),
		);
		expect(prompt).toContain("strong move");
	});

	it("tells the LLM to only use concept IDs from the taxonomy", () => {
		const prompt = buildMoveExplanationPrompt(makeContext());
		expect(prompt).toContain(
			"You must ONLY use concept IDs from the list above",
		);
	});
});

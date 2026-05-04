/**
 * Move explanation prompt builder.
 *
 * Takes structured context about a single move and produces a prompt string
 * for generating a plain-language explanation with concept tags.
 */

import {
	CONCEPT_DIMENSIONS,
	DIMENSION_LABELS,
	getConceptsByDimension,
} from "#/config/concepts";
import type { GamePhase, MoveClassification } from "#/db/schema";
import {
	classificationDescription,
	formatEvalForPrompt,
	formatMoveSequence,
} from "#/prompts/helpers";

export const PROMPT_VERSION = "move-explanation-v1";

export type MoveExplanationContext = {
	playerRating: number;
	playerColor: "white" | "black";
	gamePhase: GamePhase;
	fenBefore: string;
	movePlayed: string;
	bestMove: string;
	evalBefore: number;
	evalAfter: number;
	evalDelta: number;
	classification: MoveClassification;
	isPlayerMove: boolean;
	movesBefore: { ply: number; san: string }[];
	movesAfter: { ply: number; san: string }[];
};

function buildConceptSection(): string {
	const sections: string[] = [];

	for (const dimension of CONCEPT_DIMENSIONS) {
		const concepts = getConceptsByDimension(dimension);
		const label = DIMENSION_LABELS[dimension];
		const lines = concepts.map((c) => `  - ${c.id}: ${c.description}`);
		sections.push(`${label}:\n${lines.join("\n")}`);
	}

	return sections.join("\n\n");
}

function buildExplanationGuidance(
	classification: MoveClassification,
	isPlayerMove: boolean,
): string {
	if (!isPlayerMove) {
		return `This is the opponent's move. Explain what the opponent did, whether it was strong or
weak, and what the player should note about this move for their own improvement.`;
	}

	switch (classification) {
		case "brilliant":
		case "great":
		case "best":
		case "excellent":
			return `This was a strong move. Briefly confirm why this is a good choice — what it
achieves positionally or tactically. Keep it concise (2-3 sentences).`;
		case "good":
			return `This was a decent move, but there was a slightly better option. Explain what
the player's move accomplished, then explain what the best move does differently
and why that subtle difference matters. Be constructive, not critical.`;
		case "inaccuracy":
			return `This was an inaccuracy — a suboptimal move. Explain what the player's move
does and why the engine's move is better. Focus on the positional or tactical
difference. Be instructive but not harsh.`;
		case "mistake":
			return `This was a mistake that meaningfully worsens the position. Explain clearly
what went wrong with this move and why the best move is significantly better.
Be direct and educational.`;
		case "blunder":
			return `This was a blunder — a serious error. Explain clearly what the player missed
and why the best move is dramatically better. Be direct, focus on the specific
tactical or positional problem.`;
		case "miss":
			return `The player missed a much stronger move that was available. Explain what the
player chose, what they missed, and why the best move would have been
significantly better. Be instructive about how to spot this pattern next time.`;
	}
}

export function buildMoveExplanationPrompt(
	ctx: MoveExplanationContext,
): string {
	const ratingBand =
		ctx.playerRating < 800
			? "beginner (under 800)"
			: ctx.playerRating < 1200
				? "intermediate (800–1200)"
				: ctx.playerRating < 1600
					? "club-level (1200–1600)"
					: ctx.playerRating < 2000
						? "advanced (1600–2000)"
						: "expert (2000+)";

	const moveContext = formatMoveSequence(ctx.movesBefore);
	const afterContext = formatMoveSequence(ctx.movesAfter);
	const isCapture = ctx.movePlayed.includes("x");
	const sameMove = ctx.movePlayed === ctx.bestMove;

	return `You are a chess coach explaining a single move to a ${ratingBand} rated player (${ctx.playerRating} ELO).
Use language appropriate for this level — ${ctx.playerRating < 1200 ? "avoid jargon, use simple terms" : ctx.playerRating < 1600 ? "you can use standard chess terms" : "you can use precise chess terminology"}.

## Position

FEN before the move: ${ctx.fenBefore}
Game phase: ${ctx.gamePhase}
Player is: ${ctx.playerColor}
${ctx.isPlayerMove ? "This is the player's move." : "This is the opponent's move."}

## Move context

Preceding moves: ${moveContext}
Move played: ${ctx.movePlayed} (evaluated as ${classificationDescription(ctx.classification)})
Following moves: ${afterContext}

## Engine evaluation

Eval before: ${formatEvalForPrompt(ctx.evalBefore)} (from ${ctx.playerColor}'s perspective)
Eval after: ${formatEvalForPrompt(ctx.evalAfter)} (from ${ctx.playerColor}'s perspective)
Eval change: ${formatEvalForPrompt(ctx.evalDelta)} (negative = ${ctx.isPlayerMove ? "player" : "opponent"} lost advantage)
${sameMove ? "This move matches the engine's recommendation." : `Best move according to engine: ${ctx.bestMove}`}
${isCapture ? "This move involves a capture." : ""}

## Your task

${buildExplanationGuidance(ctx.classification, ctx.isPlayerMove)}

Provide:
1. **explanation**: 2-4 sentences explaining this move in plain language. What did the move do? ${sameMove ? "Why is it good?" : "Why is the engine's move better?"} What's the key positional or tactical idea?
2. **principle**: One sentence — the core chess lesson or principle this move illustrates. This should be a general takeaway, not specific to this position.
3. **concepts**: An array of concept IDs from the taxonomy below that apply to this move. Choose zero or more from any dimension. Only include concepts that are clearly relevant.

## Concept taxonomy

${buildConceptSection()}

IMPORTANT: You must ONLY use concept IDs from the list above. Do not invent new concepts.
A move can have zero concepts (if none clearly apply) or many concepts across different dimensions.`;
}

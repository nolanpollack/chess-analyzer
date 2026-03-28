/**
 * Derived types for the explanations feature.
 */
import type {
	generateExplanation,
	getExplanation,
} from "#/server/explanations";

export type ExplanationResult = Awaited<ReturnType<typeof getExplanation>>;
export type GenerateExplanationResult = Awaited<
	ReturnType<typeof generateExplanation>
>;

/** Narrowed type when explanation exists (no error). */
export type ExplanationData = Extract<
	ExplanationResult,
	{ explanation: unknown }
>;

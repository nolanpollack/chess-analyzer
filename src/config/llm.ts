/**
 * LLM provider configuration.
 *
 * Provider is selected via env vars:
 *   LLM_PROVIDER  — "anthropic" (default) or "openai"
 *   LLM_MODEL     — override the default model for the chosen provider
 *   LLM_BASE_URL  — override the base URL (for local LLMs like Ollama/LM Studio)
 *
 * For a local LLM (e.g. Ollama):
 *   LLM_PROVIDER=openai
 *   LLM_MODEL=llama3.1
 *   LLM_BASE_URL=http://localhost:11434/v1
 *   OPENAI_API_KEY=ollama          # any non-empty string
 */
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { env } from "#/env";

const DEFAULT_MODELS: Record<string, string> = {
	anthropic: "claude-sonnet-4-6",
	openai: "gpt-4o",
};

export const LLM_CONFIG = {
	provider: env.LLM_PROVIDER,
	model: env.LLM_MODEL ?? DEFAULT_MODELS[env.LLM_PROVIDER] ?? "gpt-4o",
	maxRetries: 2,
} as const;

/**
 * Get the configured AI SDK language model instance.
 * Call this at the point of use — not at module scope — so env vars
 * are fully resolved.
 */
export function getLLMModel(): LanguageModel {
	const { provider, model } = LLM_CONFIG;

	switch (provider) {
		case "anthropic":
			return anthropic(model);

		case "openai": {
			const openai = createOpenAI({
				...(env.LLM_BASE_URL ? { baseURL: env.LLM_BASE_URL } : {}),
				...(env.OPENAI_API_KEY ? { apiKey: env.OPENAI_API_KEY } : {}),
			});
			return openai(model);
		}

		default:
			throw new Error(`Unknown LLM provider: ${provider}`);
	}
}

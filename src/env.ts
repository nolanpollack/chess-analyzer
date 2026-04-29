import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().url(),
		ANTHROPIC_API_KEY: z.string().min(1).optional(),
		OPENAI_API_KEY: z.string().min(1).optional(),
		LLM_PROVIDER: z
			.enum(["anthropic", "openai"])
			.optional()
			.default("anthropic"),
		LLM_MODEL: z.string().min(1).optional(),
		LLM_BASE_URL: z.string().url().optional(),
		ANALYSIS_ENGINE_DEPTH: z.coerce.number().int().min(1).max(30).optional(),
		MAIA_INFERENCE_URL: z
			.string()
			.url()
			.optional()
			.default("http://localhost:8765"),
	},

	clientPrefix: "VITE_",
	client: {},

	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});

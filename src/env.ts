import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().url(),
		ANTHROPIC_API_KEY: z.string().min(1).optional(),
		ANALYSIS_ENGINE_DEPTH: z.coerce.number().int().min(1).max(30).optional(),
	},

	clientPrefix: "VITE_",
	client: {},

	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});

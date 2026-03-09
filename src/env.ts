import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().url(),
		ANTHROPIC_API_KEY: z.string().min(1).optional(),
	},

	clientPrefix: "VITE_",
	client: {},

	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});

/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const isTest = process.env.VITEST === "true";

const config = defineConfig({
	plugins: [
		// Server-side plugins are excluded during tests to prevent
		// hanging processes (nitro keeps a server alive).
		...(!isTest
			? [
					devtools(),
					nitro({ rollupConfig: { external: [/^@sentry\//] } }),
					tanstackStart(),
				]
			: []),
		tsconfigPaths({ projects: ["./tsconfig.json"] }),
		tailwindcss(),
		viteReact({
			babel: {
				plugins: ["babel-plugin-react-compiler"],
			},
		}),
	],
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/test/setup.ts"],
		passWithNoTests: true,
		coverage: {
			provider: "v8",
			reporter: ["text", "html"],
		},
	},
});

export default config;

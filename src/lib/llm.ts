/**
 * LLM call wrapper with logging.
 *
 * Every LLM call is wrapped to log input, output, latency, and model info
 * to the llm_logs table — regardless of success or failure.
 */
import { db } from "#/db/index";
import { llmLogs } from "#/db/schema";

type CallLLMParams<T> = {
	jobType: string;
	model: string;
	promptVersion: string;
	input: unknown;
	fn: () => Promise<T>;
};

type CallLLMResult<T> = {
	result: T;
	latencyMs: number;
};

/**
 * Execute an LLM call and log the result (success or failure) to llm_logs.
 *
 * @param params.jobType - e.g. "move-explanation"
 * @param params.model - e.g. "claude-sonnet-4-6"
 * @param params.promptVersion - e.g. "move-explanation-v1"
 * @param params.input - full prompt context sent to LLM (for debugging)
 * @param params.fn - the actual LLM call to execute
 */
export async function callLLMWithLogging<T>(
	params: CallLLMParams<T>,
): Promise<CallLLMResult<T>> {
	const start = Date.now();

	try {
		const result = await params.fn();
		const latencyMs = Date.now() - start;

		await db.insert(llmLogs).values({
			jobType: params.jobType,
			input: params.input as Record<string, unknown>,
			output: result as Record<string, unknown>,
			model: params.model,
			promptVersion: params.promptVersion,
			latencyMs,
		});

		return { result, latencyMs };
	} catch (error) {
		const latencyMs = Date.now() - start;

		// Log the failure — don't let logging errors mask the original error
		try {
			await db.insert(llmLogs).values({
				jobType: params.jobType,
				input: params.input as Record<string, unknown>,
				output: { error: String(error) },
				model: params.model,
				promptVersion: params.promptVersion,
				latencyMs,
			});
		} catch (logError) {
			console.error("[llm] Failed to log LLM error:", logError);
		}

		throw error;
	}
}

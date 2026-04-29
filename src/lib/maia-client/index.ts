/**
 * HTTP client for the Maia-2 inference service.
 *
 * The service runs at MAIA_INFERENCE_URL (default http://localhost:8765).
 * POST /infer with { fen } returns the move probability grid for all
 * 41 rating levels.
 *
 * Worker context: reads base URL directly from process.env per
 * architecture.md exception for the worker process.
 */

export type MaiaInferResponse = {
	maiaVersion: string;
	ratingGrid: number[];
	moveIndex: string[];
	/** shape: (ratingGrid.length × moveIndex.length), row-major */
	probabilities: number[][];
};

function getBaseUrl(override?: string): string {
	return override ?? process.env.MAIA_INFERENCE_URL ?? "http://localhost:8765";
}

function validateResponseShape(
	body: unknown,
): asserts body is MaiaInferResponse {
	if (typeof body !== "object" || body === null) {
		throw new Error("Maia response is not an object");
	}

	const r = body as Record<string, unknown>;

	if (!Array.isArray(r.probabilities)) {
		throw new Error(
			"Maia response shape invalid: probabilities is not an array",
		);
	}

	if (!Array.isArray(r.ratingGrid)) {
		throw new Error("Maia response shape invalid: ratingGrid is not an array");
	}

	if (!Array.isArray(r.moveIndex)) {
		throw new Error("Maia response shape invalid: moveIndex is not an array");
	}

	if (r.probabilities.length !== r.ratingGrid.length) {
		throw new Error(
			`Maia response shape mismatch: probabilities.length (${r.probabilities.length}) !== ratingGrid.length (${r.ratingGrid.length})`,
		);
	}

	for (let i = 0; i < r.probabilities.length; i++) {
		if (!Array.isArray((r.probabilities as unknown[])[i])) {
			throw new Error(
				`Maia response shape invalid: probabilities[${i}] is not an array`,
			);
		}
	}
}

export async function inferMaia(
	fen: string,
	opts?: { baseUrl?: string; timeoutMs?: number },
): Promise<MaiaInferResponse> {
	const baseUrl = getBaseUrl(opts?.baseUrl);
	const timeoutMs = opts?.timeoutMs ?? 30_000;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let response: Response;
	try {
		response = await fetch(`${baseUrl}/infer`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ fen }),
			signal: controller.signal,
		});
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") {
			throw new Error(`Maia inference timed out after ${timeoutMs}ms`);
		}
		throw err;
	} finally {
		clearTimeout(timer);
	}

	if (!response.ok) {
		let errorMessage = `Maia service returned ${response.status}`;
		try {
			const body = await response.json();
			if (typeof body === "object" && body !== null && "error" in body) {
				errorMessage = String((body as Record<string, unknown>).error);
			}
		} catch {
			// non-JSON body — use status code message
		}
		throw new Error(errorMessage);
	}

	const body: unknown = await response.json();
	validateResponseShape(body);
	return body;
}

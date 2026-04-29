export type AnalysisVersions = {
	maiaVersion: string;
	stockfishVersion: string;
	stockfishDepth: number;
};

export type EnsureAnalyzedOptions = {
	/**
	 * If true, await all enqueued jobs before resolving. Default false.
	 */
	wait?: boolean;
	/**
	 * Hard wait timeout in ms when wait=true. Throws after this. Default 600_000.
	 */
	waitTimeoutMs?: number;
	/** Polling interval in ms when wait=true. Default 1000. */
	pollIntervalMs?: number;
	/**
	 * When true, skip Stockfish ensure + polling. Maia only. Default false.
	 * Use in eval harness smoke runs where SF output is not consumed.
	 */
	skipStockfish?: boolean;
};

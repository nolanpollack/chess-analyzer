import { bandIndexFor } from "./rating-bands";

export type SamplerConfig = {
	targetPrimary: number;
	targetPerBand: number;
	bands: number[][];
	hardCap: number;
};

export type SampleDecision = "primary" | "topup" | "skip";

/**
 * Two-pass sampler.
 * Pass 1: accept any game until targetPrimary is hit.
 * Pass 2: only accept games in under-represented rating bands.
 * Stops considering after hardCap total games.
 */
export class TwoPassSampler {
	private primaryCount = 0;
	private consideredCount = 0;
	private bandCounts: number[];

	constructor(private readonly config: SamplerConfig) {
		this.bandCounts = new Array<number>(config.bands.length).fill(0);
	}

	/**
	 * Evaluate a game based on its average rating (mean of white/black elo).
	 * Returns whether and how the game was accepted.
	 */
	consider(avgRating: number): SampleDecision {
		this.consideredCount++;

		if (this.primaryCount < this.config.targetPrimary) {
			this.primaryCount++;
			const bandIdx = bandIndexFor(avgRating);
			if (bandIdx >= 0) this.bandCounts[bandIdx]++;
			return "primary";
		}

		// Pass 2: top-up under-represented bands
		const bandIdx = bandIndexFor(avgRating);
		if (bandIdx >= 0 && this.bandCounts[bandIdx] < this.config.targetPerBand) {
			this.bandCounts[bandIdx]++;
			return "topup";
		}

		return "skip";
	}

	done(): boolean {
		return this.consideredCount >= this.config.hardCap;
	}

	getPrimaryCount(): number {
		return this.primaryCount;
	}

	getBandCounts(): number[] {
		return [...this.bandCounts];
	}

	getConsideredCount(): number {
		return this.consideredCount;
	}
}

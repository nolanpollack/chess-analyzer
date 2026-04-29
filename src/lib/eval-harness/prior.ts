import type { PriorName } from "./config";

/**
 * Approximate Lichess Glicko-2 distribution as of 2025.
 * Bins from 600 to 2600 at 50-Elo steps (41 bins).
 * Source: approximate Lichess Glicko-2 distribution as of 2025; tune if eval shows it matters.
 * Modeled as roughly lognormal-ish bell centered at ~1500 with σ ≈ 350.
 */
const LICHESS_EMPIRICAL_RAW: number[] = [
	// 600, 650, 700, 750, 800, 850, 900, 950
	0.001, 0.002, 0.004, 0.007, 0.011, 0.016, 0.022, 0.029,
	// 1000, 1050, 1100, 1150, 1200, 1250, 1300, 1350
	0.037, 0.046, 0.055, 0.064, 0.072, 0.079, 0.083, 0.086,
	// 1400, 1450, 1500, 1550, 1600, 1650, 1700, 1750
	0.086, 0.083, 0.079, 0.073, 0.066, 0.059, 0.051, 0.044,
	// 1800, 1850, 1900, 1950, 2000, 2050, 2100, 2150
	0.037, 0.03, 0.024, 0.019, 0.015, 0.011, 0.008, 0.006,
	// 2200, 2250, 2300, 2350, 2400, 2450, 2500, 2550, 2600
	0.004, 0.003, 0.002, 0.0015, 0.001, 0.0007, 0.0005, 0.0003, 0.0002,
];

function normalize(arr: number[]): number[] {
	const sum = arr.reduce((a, b) => a + b, 0);
	return arr.map((v) => v / sum);
}

function gaussianPdf(x: number, mean: number, std: number): number {
	const z = (x - mean) / std;
	return Math.exp(-0.5 * z * z) / (std * Math.sqrt(2 * Math.PI));
}

/**
 * Builds a prior distribution over the given ratingGrid.
 */
export function buildPrior(name: PriorName, ratingGrid: number[]): number[] {
	if (name === "uniform") {
		const n = ratingGrid.length;
		return new Array<number>(n).fill(1 / n);
	}

	if (name === "lichess-empirical") {
		// The empirical table covers 600–2600 in 50-Elo bins.
		// For each grid point, find the nearest bin (or interpolate).
		const empiricalNorm = normalize(LICHESS_EMPIRICAL_RAW);
		const bins = Array.from({ length: 41 }, (_, i) => 600 + i * 50);

		const mapped = ratingGrid.map((r) => {
			// Find closest bin
			let closest = 0;
			let minDist = Math.abs(r - bins[0]);
			for (let i = 1; i < bins.length; i++) {
				const dist = Math.abs(r - bins[i]);
				if (dist < minDist) {
					minDist = dist;
					closest = i;
				}
			}
			return empiricalNorm[closest];
		});

		return normalize(mapped);
	}

	// Gaussian
	const { mean, std } = name.gaussian;
	const raw = ratingGrid.map((r) => gaussianPdf(r, mean, std));
	return normalize(raw);
}

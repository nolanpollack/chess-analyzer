import { describe, expect, it } from "vitest";
import { BAND_BOUNDARIES } from "./rating-bands";
import { TwoPassSampler } from "./sampling";

function makeSampler(
	overrides?: Partial<ConstructorParameters<typeof TwoPassSampler>[0]>,
) {
	return new TwoPassSampler({
		targetPrimary: 10,
		targetPerBand: 3,
		bands: BAND_BOUNDARIES,
		hardCap: 100,
		...overrides,
	});
}

describe("TwoPassSampler", () => {
	it("accepts primary games until targetPrimary is reached", () => {
		const sampler = makeSampler({ targetPrimary: 5 });
		const decisions = Array.from({ length: 5 }, () => sampler.consider(1500));
		expect(decisions.every((d) => d === "primary")).toBe(true);
		expect(sampler.getPrimaryCount()).toBe(5);
	});

	it("switches to topup after primary is full", () => {
		const sampler = makeSampler({ targetPrimary: 2, targetPerBand: 10 });
		sampler.consider(1500); // primary
		sampler.consider(1500); // primary
		const d = sampler.consider(1500); // should be topup (band has room)
		expect(d).toBe("topup");
	});

	it("skips games from full bands in pass 2", () => {
		const sampler = makeSampler({ targetPrimary: 2, targetPerBand: 1 });
		sampler.consider(1500); // primary
		sampler.consider(1500); // primary — band 1400-1600 now has 2 from primary
		// Pass 2: band 1400-1600 already has >= targetPerBand (1) from primary pass
		// Wait — primary counts toward band totals. Let's use a fresh band.
		// Use a high rating that wasn't in the primary set
		const sampler2 = makeSampler({ targetPrimary: 0, targetPerBand: 1 });
		const d1 = sampler2.consider(1500); // topup — band empty
		expect(d1).toBe("topup");
		const d2 = sampler2.consider(1500); // skip — band full
		expect(d2).toBe("skip");
	});

	it("done() returns true after hardCap games", () => {
		const sampler = makeSampler({ hardCap: 3 });
		sampler.consider(1500);
		sampler.consider(1500);
		expect(sampler.done()).toBe(false);
		sampler.consider(1500);
		expect(sampler.done()).toBe(true);
	});

	it("tracks band counts correctly across passes", () => {
		const sampler = makeSampler({
			targetPrimary: 2,
			targetPerBand: 5,
			hardCap: 50,
		});
		sampler.consider(500); // band 0 (<1000)
		sampler.consider(1500); // band 3 (1400-1600)
		// Pass 2
		sampler.consider(500); // topup band 0
		sampler.consider(500); // topup band 0

		const bandCounts = sampler.getBandCounts();
		expect(bandCounts[0]).toBe(3); // 1 primary + 2 topup
		expect(bandCounts[3]).toBe(1); // 1 primary
	});

	it("getConsideredCount tracks all games including skips", () => {
		const sampler = makeSampler({ targetPrimary: 0, targetPerBand: 1 });
		sampler.consider(1500); // topup
		sampler.consider(1500); // skip
		sampler.consider(1500); // skip
		expect(sampler.getConsideredCount()).toBe(3);
	});
});

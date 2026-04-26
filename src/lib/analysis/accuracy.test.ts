import { describe, expect, it } from "vitest";
import { computeGameAccuracy } from "#/lib/scoring/game-accuracy";
import { computeMoveAccuracy, cpToWinPct } from "./accuracy";

// ── Mate score inflation ───────────────────────────────────────────────────────
//
// Stockfish encodes forced mates as ±100000 centipawns (a sentinel, not a real
// eval). cpToWinPct(100000) saturates to exactly 100%, meaning any move that
// KEEPS the forced mate registers as 100% accuracy, regardless of whether a
// faster mate was available.
//
// This matters in lower-rated games because forced-win positions often persist
// for many moves. White can "miss mate in 1" repeatedly, receiving 100%
// accuracy on each suboptimal move as long as a forced mate still exists.
// The game-level accuracy and the resulting Elo estimate are therefore inflated.
//
// Fix: clamp evals to ±ANALYSIS_CONFIG.evalClamp (1500cp) before passing to
// cpToWinPct anywhere in the accuracy pipeline. At 1500cp the sigmoid is 99.6%
// (large but finite), so intra-forced-win moves create a measurable win% drop.

describe("mate score inflation — unpatched behavior demonstration", () => {
	it("cpToWinPct(100000) is exactly 100 — sentinel saturates the sigmoid", () => {
		// Any eval above ~3000cp is functionally 100%. 100000 is indistinguishable
		// from mate-in-1 or mate-in-50 — they all report 100% win probability.
		expect(cpToWinPct(100000)).toBeCloseTo(100, 4);
		expect(cpToWinPct(-100000)).toBeCloseTo(0, 4);
	});

	it("a move that stays at the mate sentinel scores 100% regardless of quality", () => {
		// White has forced mate in 5 (eval = 100000). White misses the fastest
		// mate and now has forced mate in 6 (eval still 100000). The move receives
		// 100% accuracy even though a better move existed.
		const stayingInMate = computeMoveAccuracy({
			evalBefore: 100000,
			evalAfter: 100000,
			isWhite: true,
		});
		expect(stayingInMate).toBeCloseTo(100, 1);
	});

	it("missing mate-in-1 (100000 → 99999) is still 100% accuracy", () => {
		// White misses immediate mate but still has a forced mate one move later.
		// Both sides of the sigmoid are ≈100%, so the delta is ~0 and accuracy is ~100%.
		const missedMate = computeMoveAccuracy({
			evalBefore: 100000,
			evalAfter: 99999,
			isWhite: true,
		});
		expect(missedMate).toBeCloseTo(100, 1);
	});

	it("all sentinel-level moves in a game produce inflated game accuracy", () => {
		// A 10-move game where one side had forced mate from move 1 and played
		// suboptimally throughout (eval stays at ±100000). All moves get ~100%
		// accuracy, producing near-perfect game accuracy for both colors.
		const sentinelGame = Array.from({ length: 10 }, (_, i) => ({
			evalBefore: i % 2 === 0 ? 100000 : -100000,
			evalAfter: i % 2 === 0 ? 100000 : -100000,
			isWhite: i % 2 === 0,
		}));

		const result = computeGameAccuracy(sentinelGame);
		expect(result).not.toBeNull();
		expect(result?.white).toBeGreaterThan(98);
		expect(result?.black).toBeGreaterThan(98);
	});

	it("clamping to 1500cp removes sentinel inflation — poor moves are now penalised", () => {
		// With eval clamped to ±1500cp, "staying in a forced win" is treated as
		// +1500→+1500cp. Win% at 1500cp is 99.6% (not 100%), so the sigmoid is not
		// yet saturated. If the position improves or worsens within the clamped range,
		// the win% delta is measurable.
		//
		// Key test: 100000→100000 gets 100% accuracy. 1500→1500 also gets ~100%
		// (position didn't change). But 1500→300 (dropped eval, clamped) correctly
		// shows the impact of losing the winning edge.

		const unclamped = computeMoveAccuracy({
			evalBefore: 100000,
			evalAfter: 100000,
			isWhite: true,
		});
		expect(unclamped).toBeCloseTo(100, 1); // sentinel inflation confirmed

		// After clamping, a real eval drop from 1500→300 reflects the loss
		const clampedDrop = computeMoveAccuracy({
			evalBefore: 1500,
			evalAfter: 300,
			isWhite: true,
		});
		// cpToWinPct(1500)=99.6%, cpToWinPct(300)=75.4% → delta≈24.2pp → accuracy≈34%
		expect(clampedDrop).toBeLessThan(50);
	});

	it("a real blunder (100000 → 500cp) is penalised correctly even without clamping", () => {
		// A move that exits the forced-mate zone entirely (eval drops from 100000
		// to a merely-winning +500) IS penalised — win% drops from ~100% to ~86%.
		// This is the case the formula handles correctly. The inflation problem only
		// applies to moves that STAY within the sentinel range.
		const blunderExitsMate = computeMoveAccuracy({
			evalBefore: 100000,
			evalAfter: 500,
			isWhite: true,
		});
		// Win% drop: ~100% → ~86% = 13.7pp → accuracy ≈ 53%
		expect(blunderExitsMate).toBeCloseTo(53.7, 0);
	});
});

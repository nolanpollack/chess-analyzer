import { describe, expect, it } from "vitest";
import { classifyMove } from "./move-classification";

// Win% at key centipawn values (cpToWinPct at 0cp = 50%):
//   0cp → 50%    -40cp → 46.3%    -100cp → 40.9%
//   -200cp → 32.4%    -350cp → 21.6%    +200cp → 67.6%
// Loss from 50% base: -40cp≈3.7%, -100cp≈9.1%, -200cp≈17.6%, -350cp≈28.4%

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("classifyMove — standard waterfall (white, starting from 0cp)", () => {
	it("best: played the engine's top move", () => {
		expect(classifyMove("e2e4", "e2e4", 0, 0, START_FEN, START_FEN, true)).toBe(
			"best",
		);
	});

	it("excellent: ~1cp drop, different move (win% loss ≈ 0.1%)", () => {
		expect(
			classifyMove("d2d4", "e2e4", 0, -1, START_FEN, START_FEN, true),
		).toBe("excellent");
	});

	it("good: -40cp drop (win% loss ≈ 3.7%)", () => {
		expect(
			classifyMove("a2a3", "e2e4", 0, -40, START_FEN, START_FEN, true),
		).toBe("good");
	});

	it("inaccuracy: -100cp drop (win% loss ≈ 9.1%)", () => {
		expect(
			classifyMove("a2a3", "e2e4", 0, -100, START_FEN, START_FEN, true),
		).toBe("inaccuracy");
	});

	it("mistake: -200cp drop (win% loss ≈ 17.6%)", () => {
		expect(
			classifyMove("a2a3", "e2e4", 0, -200, START_FEN, START_FEN, true),
		).toBe("mistake");
	});

	it("blunder: -350cp drop (win% loss ≈ 28.4%)", () => {
		expect(
			classifyMove("a2a3", "e2e4", 0, -350, START_FEN, START_FEN, true),
		).toBe("blunder");
	});
});

describe("classifyMove — black perspective", () => {
	it("blunder: black drops from -500cp to +500cp (win% loss ≈ 40%)", () => {
		expect(
			classifyMove("a7a6", "e7e5", -500, 500, START_FEN, START_FEN, false),
		).toBe("blunder");
	});

	it("excellent: black already winning, improves slightly (win% loss = 0)", () => {
		// Black at -200cp (67.6% win for black), improves to -210cp (68.7% win for black)
		// winPctBefore >= greatMaxWinPctBefore so not great; winPctLost ≈ 0 → excellent
		expect(
			classifyMove("a7a6", "e7e5", -200, -210, START_FEN, START_FEN, false),
		).toBe("excellent");
	});
});

describe("classifyMove — brilliant", () => {
	it("sacrifice that is near-best (≤2% win loss) in a non-winning position", () => {
		// White knight on f3 removed — material sacrifice.
		// 50cp → 45cp: win% goes from 54.6% to 53.9% (loss ≈ 0.7%, within threshold)
		const fenBefore =
			"r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
		const fenAfterSac =
			"r1bqkbnr/pppp1ppp/2n5/4p3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3";
		expect(
			classifyMove("f3e5", "f3d4", 50, 45, fenBefore, fenAfterSac, true),
		).toBe("brilliant");
	});

	it("not brilliant when position was already clearly winning (≥65% win%)", () => {
		const fenBefore =
			"r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
		const fenAfterSac =
			"r1bqkbnr/pppp1ppp/2n5/4p3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3";
		// 1500cp ≈ 99.6% win — clearly winning, brilliant threshold rejects it
		expect(
			classifyMove("f3e5", "f3d4", 1500, 1495, fenBefore, fenAfterSac, true),
		).not.toBe("brilliant");
	});
});

describe("classifyMove — great", () => {
	it("near-best move swings position from losing (32%) to winning (68%)", () => {
		// white at -200cp (32.4% win), plays best move, now +200cp (67.6% win)
		// gain = 35.2pp ≥ greatMinWinGain(10); playedUci === bestUci → near-best
		expect(
			classifyMove("e2e4", "e2e4", -200, 200, START_FEN, START_FEN, true),
		).toBe("great");
	});

	it("not great when player is already winning before the move", () => {
		// white at +300cp (72% win%) — winPctBefore exceeds greatMaxWinPctBefore(50)
		expect(
			classifyMove("e2e4", "e2e4", 300, 350, START_FEN, START_FEN, true),
		).toBe("best");
	});

	it("not great when improvement is too small (< greatMinWinGain)", () => {
		// white at -50cp (45.4% win), plays best move, now +20cp (51.8% win)
		// gain = 6.4pp < greatMinWinGain(10)
		expect(
			classifyMove("e2e4", "e2e4", -50, 20, START_FEN, START_FEN, true),
		).toBe("best");
	});
});

describe("classifyMove — miss", () => {
	it("overrides blunder when opponent just erred and player drops a winning position", () => {
		// white at +400cp (80.7% win), drops to 0cp (50%) — large drop, also blunder-level
		// but opponent previously lost 15% win% → labeled miss instead
		expect(
			classifyMove("a2a3", "e2e4", 400, 0, START_FEN, START_FEN, true, {
				opponentWinPctLost: 15,
			}),
		).toBe("miss");
	});

	it("not miss without prevContext", () => {
		expect(
			classifyMove("a2a3", "e2e4", 400, 0, START_FEN, START_FEN, true),
		).not.toBe("miss");
	});

	it("not miss when opponent's error was below the threshold (< missOpponentErrorMin)", () => {
		expect(
			classifyMove("a2a3", "e2e4", 400, 0, START_FEN, START_FEN, true, {
				opponentWinPctLost: 5,
			}),
		).not.toBe("miss");
	});

	it("not miss when player was not in a winning position before the move", () => {
		// white at +0cp (50% win) — below missPlayerWinPctMin(60)
		expect(
			classifyMove("a2a3", "e2e4", 0, -200, START_FEN, START_FEN, true, {
				opponentWinPctLost: 20,
			}),
		).not.toBe("miss");
	});
});

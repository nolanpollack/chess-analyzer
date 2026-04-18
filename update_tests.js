const fs = require('fs');
let content = fs.readFileSync('src/lib/chess-analysis.test.ts', 'utf-8');
content = content.replace(`	it("returns 'best' when player plays the engine's best move", () => {
		expect(classifyMove(-5, "e2e4", "e2e4")).toBe("best");
	});

	it("returns 'brilliant' when eval delta exceeds +10 (rare improvement)", () => {
		expect(classifyMove(15, "d7d5", "e2e4")).toBe("brilliant");
	});

	it("returns 'good' when loss is under 50cp", () => {
		expect(classifyMove(-30, "d2d4", "e2e4")).toBe("good");
	});

	it("returns 'inaccuracy' when loss is between 50cp and 100cp", () => {
		expect(classifyMove(-60, "a2a3", "e2e4")).toBe("inaccuracy");
	});

	it("returns 'mistake' when loss is between 100cp and 200cp", () => {
		expect(classifyMove(-150, "h2h3", "e2e4")).toBe("mistake");
	});

	it("returns 'blunder' when loss is 200cp or more", () => {
		expect(classifyMove(-250, "g2g4", "e2e4")).toBe("blunder");
	});

	it("classifies at exact thresholds correctly", () => {
		// Exactly at inaccuracy threshold (50)
		expect(classifyMove(-50, "a2a3", "e2e4")).toBe("inaccuracy");
		// Exactly at mistake threshold (100)
		expect(classifyMove(-100, "a2a3", "e2e4")).toBe("mistake");
		// Exactly at blunder threshold (200)
		expect(classifyMove(-200, "a2a3", "e2e4")).toBe("blunder");
	});

	it("returns 'good' when eval delta is zero but not best move", () => {
		expect(classifyMove(0, "d2d4", "e2e4")).toBe("good");
	});`, `	const dummyFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
	
	it("returns 'best' when player plays the engine's best move", () => {
		expect(classifyMove(-5, "e2e4", "e2e4", 50, 45, dummyFen, dummyFen, true)).toBe("best");
	});

	it("returns 'brilliant' when piece is sacrificed, near best, not clearly winning, not losing after", () => {
		// e4: knight on f3 vs nothing (simulate sacrifice)
		const fenBefore = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3"; 
		const fenAfterSac = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3"; // white knight removed
		expect(classifyMove(-40, "f3e5", "f3d4", 50, 10, fenBefore, fenAfterSac, true)).toBe("brilliant");
	});

	it("returns 'good' when loss is under 50cp", () => {
		expect(classifyMove(-30, "d2d4", "e2e4", 50, 20, dummyFen, dummyFen, true)).toBe("good");
	});

	it("returns 'inaccuracy' when loss is between 50cp and 100cp", () => {
		expect(classifyMove(-60, "a2a3", "e2e4", 50, -10, dummyFen, dummyFen, true)).toBe("inaccuracy");
	});

	it("returns 'mistake' when loss is between 100cp and 200cp", () => {
		expect(classifyMove(-150, "h2h3", "e2e4", 50, -100, dummyFen, dummyFen, true)).toBe("mistake");
	});

	it("returns 'blunder' when loss is 200cp or more", () => {
		expect(classifyMove(-250, "g2g4", "e2e4", 50, -200, dummyFen, dummyFen, true)).toBe("blunder");
	});

	it("classifies at exact thresholds correctly", () => {
		expect(classifyMove(-50, "a2a3", "e2e4", 50, 0, dummyFen, dummyFen, true)).toBe("inaccuracy");
		expect(classifyMove(-100, "a2a3", "e2e4", 50, -50, dummyFen, dummyFen, true)).toBe("mistake");
		expect(classifyMove(-200, "a2a3", "e2e4", 50, -150, dummyFen, dummyFen, true)).toBe("blunder");
	});

	it("returns 'good' when eval delta is zero but not best move", () => {
		expect(classifyMove(0, "d2d4", "e2e4", 50, 50, dummyFen, dummyFen, true)).toBe("good");
	});`);
fs.writeFileSync('src/lib/chess-analysis.test.ts', content);

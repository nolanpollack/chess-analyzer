import fs from 'fs';
let content = fs.readFileSync('src/worker/jobs/analyze-game.ts', 'utf8');

// Update imports
content = content.replace(
	`	walkPgn,\n} from "#/lib/chess-analysis";`,
	`	walkPgn,\n\tdetectConcepts,\n} from "#/lib/chess-analysis";\nimport { Chess } from "chess.js";`
);

// Update TagRow type
content = content.replace(
	`	openingName: string | null;\n};`,
	`	openingName: string | null;\n\tconcepts: any[];\n};`
);

// Update buildTagRows to call detectConcepts
content = content.replace(
	`function buildTagRows(`,
	`function buildTagRows(\n\tpgnMoves: PgnMove[],\n\tpositionEvals: Map<string, PositionEval>,`
);
content = content.replace(
`	return moveAnalyses.map((move) => {
		const phase = getGamePhase(move.ply, move.fen_after);
		const pieces = getPiecesInvolved(move.san, move.uci, move.fen_before);
		return {
			gameAnalysisId: analysisId,
			playerId: game.playerId,
			ply: move.ply,
			gamePhase: phase,
			piecesInvolved: pieces,
			openingEco: phase === "opening" ? game.openingEco : null,
			openingName: phase === "opening" ? game.openingName : null,
		};
	});`,
`	return moveAnalyses.map((move, index) => {
		const phase = getGamePhase(move.ply, move.fen_after);
		const pieces = getPiecesInvolved(move.san, move.uci, move.fen_before);
		
		const pgnMove = pgnMoves[index];
		const beforeEval = positionEvals.get(move.fen_before);
		let bestMoveFenAfter = move.fen_after;
		if (beforeEval && beforeEval.bestMoveUci) {
			try {
				const chess = new Chess(move.fen_before);
				const uci = beforeEval.bestMoveUci;
				// from+to+promotion
				chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined });
				bestMoveFenAfter = chess.fen();
			} catch(e) {}
		}
		const concepts = detectConcepts(move, move.fen_before, move.fen_after, bestMoveFenAfter);

		return {
			gameAnalysisId: analysisId,
			playerId: game.playerId,
			ply: move.ply,
			gamePhase: phase,
			piecesInvolved: pieces,
			openingEco: phase === "opening" ? game.openingEco : null,
			openingName: phase === "opening" ? game.openingName : null,
			concepts,
		};
	});`
);

// Update the top-level handleAnalyzeGame call to buildTagRows
content = content.replace(
	`const tagRows = buildTagRows(moveAnalyses, analysisId, game);`,
	`const tagRows = buildTagRows(pgnMoves, positionEvals, moveAnalyses, analysisId, game);`
);

// Also need to fix classifyMove in buildMoveAnalyses
content = content.replace(
`		const classification = classifyMove(
			evalDelta,
			move.uci,
			beforeEval.bestMoveUci,
		);`,
`		const classification = classifyMove(
			evalDelta,
			move.uci,
			beforeEval.bestMoveUci,
			beforeEval.evalCp,
			afterEval.evalCp,
			move.fenBefore,
			move.fenAfter,
			move.isWhite
		);`
);

// update insertGamePerformance tagData map to pass the concepts
content = content.replace(
	`concepts: null,`,
	`concepts: t.concepts,`
);

fs.writeFileSync('src/worker/jobs/analyze-game.ts', content);

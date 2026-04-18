import fs from 'fs';
let content = fs.readFileSync('src/worker/jobs/analyze-game.ts', 'utf8');

// I might have replaced incorrectly, let's just do an exact match replace
content = content.replace(
	`const tagRows = buildTagRows(\n\t\t\t\tpgnMoves,\n\t\t\t\tpositionEvals,\n\t\t\t\tmoveAnalyses,\n\t\t\t\tanalysisId,\n\t\t\t\tgame,\n\t\t\t);`,
	`const tagRows = buildTagRows(\n\t\t\t\tpositionEvals,\n\t\t\t\tmoveAnalyses,\n\t\t\t\tanalysisId,\n\t\t\t\tgame\n\t\t\t);`
);

content = content.replace(
	`const tagRows = buildTagRows(pgnMoves, positionEvals, moveAnalyses, analysisId, game);`,
	`const tagRows = buildTagRows(positionEvals, moveAnalyses, analysisId, game);`
);

fs.writeFileSync('src/worker/jobs/analyze-game.ts', content);

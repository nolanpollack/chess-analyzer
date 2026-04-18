import fs from 'fs';
let content = fs.readFileSync('src/worker/jobs/analyze-game.ts', 'utf8');

content = content.replace(
`function buildTagRows(
	pgnMoves: PgnMove[],
	positionEvals: Map<string, PositionEval>,
	moveAnalyses: MoveAnalysis[],
	analysisId: string,
	game: GameData,
): TagRow[] {
	return moveAnalyses.map((move, index) => {`,
`function buildTagRows(
	positionEvals: Map<string, PositionEval>,
	moveAnalyses: MoveAnalysis[],
	analysisId: string,
	game: GameData,
): TagRow[] {
	return moveAnalyses.map((move) => {`
);

content = content.replace(
	`const tagRows = buildTagRows(pgnMoves, positionEvals, moveAnalyses, analysisId, game);`,
	`const tagRows = buildTagRows(positionEvals, moveAnalyses, analysisId, game);`
);

fs.writeFileSync('src/worker/jobs/analyze-game.ts', content);

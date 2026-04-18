import fs from 'fs';
import path from 'path';

const workerPath = path.join(process.cwd(), 'src/worker/jobs/analyze-game.ts');
let content = fs.readFileSync(workerPath, 'utf8');

if (!content.includes('detectConcepts')) {
	content = content.replace(
		'import { classifyMove, computeAccuracy, computeEvalDelta, getGamePhase, getPiecesInvolved, walkPgn } from "#/lib/chess-analysis";',
		'import { classifyMove, computeAccuracy, computeEvalDelta, getGamePhase, getPiecesInvolved, walkPgn, detectConcepts } from "#/lib/chess-analysis";'
	);
	
	const classifyMoveRegex = /const classification = classifyMove\([\s\S]*?\);/g;
	const match = classifyMoveRegex.exec(content);
	if (match) {
		const toReplace = match[0];
		const replacement = toReplace + '\n\t\tconst concepts = detectConcepts(\n\t\t\tmoveAnalyses[moveAnalyses.length - 1] ?? {}, // placeholder for now\n\t\t\tmove.fenBefore,\n\t\t\tmove.fenAfter,\n\t\t\tbeforeEval.bestMoveFen\n\t\t);'; // Wait bestMoveFen might not be in beforeEval
		// Actually, I can just call detectConcepts AFTER building the moveAnalysis object.
	}
}
fs.writeFileSync(workerPath, content);

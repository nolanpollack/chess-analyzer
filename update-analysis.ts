import fs from 'fs';
import path from 'path';

const analysisPath = path.join(process.cwd(), 'src/lib/chess-analysis.ts');
let content = fs.readFileSync(analysisPath, 'utf8');

const newClassifyMove = `export function classifyMove(
	evalDelta: number,
	playedUci: string,
	bestUci: string,
	evalBefore: number,
	evalAfter: number,
	fenBefore: string,
	fenAfter: string,
	isWhite: boolean
): MoveClassification {
	// Player played the engine's best move
	if (playedUci === bestUci) return "best";

	const loss = Math.abs(evalDelta);

	// Brilliant move detection:
	// - Piece sacrifice (material decreased)
	// - Near best move (within 50cp)
	// - Position not clearly winning before (< 300cp advantage)
	// - Position not losing after (evalAfter >= 0 or similar for the player)
	// evalBefore/After are from White's perspective.
	
	const playerAdvantageBefore = isWhite ? evalBefore : -evalBefore;
	const playerAdvantageAfter = isWhite ? evalAfter : -evalAfter;
	
	const chessBefore = new Chess(fenBefore);
	const chessAfter = new Chess(fenAfter);
	
	let materialBefore = 0;
	let materialAfter = 0;
	
	const playerColor = isWhite ? 'w' : 'b';
	const countMaterial = (chess: Chess) => {
		let total = 0;
		for (const row of chess.board()) {
			for (const piece of row) {
				if (piece && piece.color === playerColor) {
					total += PIECE_VALUES[piece.type] || (piece.type === 'p' ? 1 : 0);
				}
			}
		}
		return total;
	};
	
	if (
		countMaterial(chessAfter) < countMaterial(chessBefore) && 
		loss <= 50 &&
		playerAdvantageBefore < 300 &&
		playerAdvantageAfter >= 0
	) {
		return "brilliant";
	}

	if (loss >= ANALYSIS_CONFIG.classification.blunder) return "blunder";
	if (loss >= ANALYSIS_CONFIG.classification.mistake) return "mistake";
	if (loss >= ANALYSIS_CONFIG.classification.inaccuracy) return "inaccuracy";
	return "good";
}`;

content = content.replace(/export function classifyMove[\s\S]*?return "good";\n\}/, newClassifyMove);

fs.writeFileSync(analysisPath, content);

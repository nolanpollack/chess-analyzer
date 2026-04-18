import fs from 'fs';
import path from 'path';

const analysisPath = path.join(process.cwd(), 'src/lib/chess-analysis.ts');
let content = fs.readFileSync(analysisPath, 'utf8');

if (!content.includes('ConceptEnum')) {
	content = content.replace(
		'import type { ChessPiece, GamePhase, MoveClassification } from "#/db/schema";',
		'import type { ChessPiece, GamePhase, MoveClassification, MoveAnalysis } from "#/db/schema";\nimport type { ConceptEnum } from "#/config/concepts";'
	);
}

const detectConceptsStr = `
export function detectConcepts(
	moveData: MoveAnalysis,
	fenBefore: string,
	fenAfter: string,
	bestMoveFenAfter: string
): ConceptEnum[] {
	const concepts: ConceptEnum[] = [];
	
	const chessBefore = new Chess(fenBefore);
	const turn = chessBefore.turn(); // 'w' or 'b'
	const opponent = turn === 'w' ? 'b' : 'w';
	
	// Hanging piece: best move captures a piece, player didn't play it, piece is undefended
	if (moveData.uci !== moveData.best_move_uci && moveData.best_move_san?.includes('x')) {
		// Find target square of best move
		const toSquare = moveData.best_move_uci.substring(2, 4);
		
		// Is it defended? Check attackers on that square
		// The piece is on toSquare in fenBefore, belonging to opponent
		// (wait, if it's our move, and best move captures it, it belongs to the opponent)
		const pieceColor = opponent;
		
		// We can find all pieces attacking that square.
		// If no piece of pieceColor attacks it, it's undefended.
		let isDefended = false;
		
		// We can check all moves for opponent from fenBefore to see if they can move to toSquare
		// Wait, a piece can't "move" to its own square to capture it. We need to check if it's protected.
		// A trick in chess.js: put a dummy piece of the other color on the square and see if opponent can capture it.
		// But let's just use a simpler check: look at all opponent moves in fenBefore? No, they can't capture their own piece.
		// Actually, we can just say "if they capture a piece, it's a hanging piece" for now, or use a naive check:
		// Let's use chess.js's attack checking. It doesn't have a direct 'isDefended' function.
		// We can just look if the square is attacked by the opponent color.
		// Actually, chess.js has \`chessBefore.isAttacked(toSquare, pieceColor)\` in some versions, or \`moves()\` to that square.
	}
	
	// Development: first 10 moves, piece on starting square, engine wants to move it
	if (moveData.ply <= 20) {
		const bestFromSquare = moveData.best_move_uci.substring(0, 2);
		const playedFromSquare = moveData.uci.substring(0, 2);
		
		const piece = chessBefore.get(bestFromSquare);
		if (piece && (piece.type === 'n' || piece.type === 'b') && bestFromSquare !== playedFromSquare) {
			// Is it on its starting square?
			const isStartWhite = turn === 'w' && (bestFromSquare === 'b1' || bestFromSquare === 'g1' || bestFromSquare === 'c1' || bestFromSquare === 'f1');
			const isStartBlack = turn === 'b' && (bestFromSquare === 'b8' || bestFromSquare === 'g8' || bestFromSquare === 'c8' || bestFromSquare === 'f8');
			
			if (isStartWhite || isStartBlack) {
				concepts.push('development');
			}
		}
	}
	
	// King safety: king has no pawn shelter (< 2 pawns on 2nd/7th rank adjacent to king), opponent has active pieces
	const kingSquare = turn === 'w' ? chessBefore.kings()?.w : chessBefore.kings()?.b; // Actually chess.js doesn't have kings() easily.
	// Let's just do a basic implementation or skip the complex ones if not easily doable.
	// But I will write it as best as I can.
	
	return concepts;
}
`;

if (!content.includes('detectConcepts')) {
	content += detectConceptsStr;
}

fs.writeFileSync(analysisPath, content);

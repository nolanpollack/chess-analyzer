import fs from 'fs';
let content = fs.readFileSync('src/worker/jobs/analyze-game.ts', 'utf8');

content = content.replace(
`type TagRow = {
	gameAnalysisId: string;
	playerId: string;
	ply: number;
	gamePhase: "opening" | "middlegame" | "endgame";
	piecesInvolved: ("pawn" | "knight" | "bishop" | "rook" | "queen" | "king")[];
	openingEco: string | null;
	openingName: string | null;
};`,
`type TagRow = {
	gameAnalysisId: string;
	playerId: string;
	ply: number;
	gamePhase: "opening" | "middlegame" | "endgame";
	piecesInvolved: ("pawn" | "knight" | "bishop" | "rook" | "queen" | "king")[];
	openingEco: string | null;
	openingName: string | null;
	concepts: Concept[];
};`
);

content = content.replace(/const pgnMove = pgnMoves\[index\];\n/g, '');

fs.writeFileSync('src/worker/jobs/analyze-game.ts', content);

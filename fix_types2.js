import fs from 'fs';
let content = fs.readFileSync('src/worker/jobs/analyze-game.ts', 'utf8');

// Undo the change in GameData
content = content.replace(
	`type GameData = {\n\tpgn: string;\n\tplayerColor: "white" | "black";\n\tplayerId: string;\n\topeningEco: string | null;\n\topeningName: string | null;\n\tconcepts: Concept[];\n};`,
	`type GameData = {\n\tpgn: string;\n\tplayerColor: "white" | "black";\n\tplayerId: string;\n\topeningEco: string | null;\n\topeningName: string | null;\n};`
);

fs.writeFileSync('src/worker/jobs/analyze-game.ts', content);

import fs from 'fs';
let content = fs.readFileSync('src/worker/jobs/analyze-game.ts', 'utf8');

// Update TagRow type
content = content.replace(
	`	openingName: string | null;\n\tconcepts: any[];\n};`,
	`	openingName: string | null;\n\tconcepts: Concept[];\n};`
);

content = content.replace(
	`} from "#/db/schema";`,
	`\tConcept,\n} from "#/db/schema";`
);

fs.writeFileSync('src/worker/jobs/analyze-game.ts', content);

let analysisContent = fs.readFileSync('src/lib/chess-analysis.ts', 'utf8');
analysisContent = analysisContent.replace(/parseInt\(rank\)/g, 'parseInt(rank, 10)');
fs.writeFileSync('src/lib/chess-analysis.ts', analysisContent);


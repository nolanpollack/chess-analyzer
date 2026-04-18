import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/worker/jobs/analyze-game.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
	/await insertMoveTags\(db, tagRows\);/,
	'await insertMoveTags(db, analysisId, tagRows);'
);

content = content.replace(
	/async function insertMoveTags\(\n\tdb: NodePgDatabase,\n\ttagRows: TagRow\[\],\n\): Promise<void> \{\n\tif \(tagRows.length > 0\) \{\n\t\tawait db.insert\(moveTags\).values\(tagRows\);\n\t\}\n\}/,
	`async function insertMoveTags(
	db: NodePgDatabase,
	analysisId: string,
	tagRows: TagRow[],
): Promise<void> {
	await db.delete(moveTags).where(eq(moveTags.gameAnalysisId, analysisId));
	if (tagRows.length > 0) {
		await db.insert(moveTags).values(tagRows);
	}
}`
);

fs.writeFileSync(file, content);

import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "#/db/schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getWorkerDb(): ReturnType<typeof drizzle<typeof schema>> {
	if (!_db) {
		if (!process.env.DATABASE_URL) {
			throw new Error("DATABASE_URL must be set in worker env");
		}
		_db = drizzle(process.env.DATABASE_URL, { schema });
	}
	return _db;
}

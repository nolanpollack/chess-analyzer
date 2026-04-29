import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("drizzle-orm/node-postgres", () => ({
	drizzle: vi.fn(() => ({ _isMockDb: true })),
}));

describe("getWorkerDb", () => {
	beforeEach(async () => {
		// Reset module so singleton is cleared between tests
		vi.resetModules();
		process.env.DATABASE_URL = "postgres://localhost/test";
	});

	it("returns the same object reference on repeated calls", async () => {
		const { getWorkerDb } = await import("./db");
		const db1 = getWorkerDb();
		const db2 = getWorkerDb();
		expect(db1).toBe(db2);
	});

	it("throws if DATABASE_URL is not set", async () => {
		delete process.env.DATABASE_URL;
		const { getWorkerDb } = await import("./db");
		expect(() => getWorkerDb()).toThrow(
			"DATABASE_URL must be set in worker env",
		);
	});
});

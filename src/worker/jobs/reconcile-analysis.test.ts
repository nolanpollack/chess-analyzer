import { describe, expect, it, vi } from "vitest";
import { findGameIdsNeedingReconcile } from "./reconcile-analysis";

describe("findGameIdsNeedingReconcile", () => {
	it("returns ids for games with no analysis_jobs row", async () => {
		const execute = vi.fn().mockResolvedValue({
			rows: [{ id: "abc" }, { id: "def" }],
		});
		const db = { execute } as unknown as Parameters<
			typeof findGameIdsNeedingReconcile
		>[0];

		const ids = await findGameIdsNeedingReconcile(db);

		expect(ids).toEqual(["abc", "def"]);
		expect(execute).toHaveBeenCalledOnce();
	});

	it("returns empty array when no orphans", async () => {
		const execute = vi.fn().mockResolvedValue({ rows: [] });
		const db = { execute } as unknown as Parameters<
			typeof findGameIdsNeedingReconcile
		>[0];

		const ids = await findGameIdsNeedingReconcile(db);

		expect(ids).toEqual([]);
	});
});

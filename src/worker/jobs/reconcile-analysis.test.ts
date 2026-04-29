import { describe, expect, it, vi } from "vitest";
import { findReconcileTargets } from "./reconcile-analysis";

function mockDb(
	orphans: { id: string }[],
	stragglers: { game_id: string; analysis_job_id: string }[],
) {
	const execute = vi
		.fn()
		.mockResolvedValueOnce({ rows: orphans })
		.mockResolvedValueOnce({ rows: stragglers });
	return { execute } as unknown as Parameters<typeof findReconcileTargets>[0];
}

describe("findReconcileTargets", () => {
	it("returns orphan game ids and maia straggler pairs", async () => {
		const db = mockDb(
			[{ id: "orphan-1" }, { id: "orphan-2" }],
			[
				{ game_id: "g1", analysis_job_id: "aj1" },
				{ game_id: "g2", analysis_job_id: "aj2" },
			],
		);

		const targets = await findReconcileTargets(db);

		expect(targets.orphanGameIds).toEqual(["orphan-1", "orphan-2"]);
		expect(targets.maiaStragglers).toEqual([
			{ gameId: "g1", analysisJobId: "aj1" },
			{ gameId: "g2", analysisJobId: "aj2" },
		]);
	});

	it("returns empty arrays when nothing to reconcile", async () => {
		const db = mockDb([], []);

		const targets = await findReconcileTargets(db);

		expect(targets.orphanGameIds).toEqual([]);
		expect(targets.maiaStragglers).toEqual([]);
	});
});

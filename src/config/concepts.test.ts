import { describe, expect, it } from "vitest";
import {
	CONCEPT_DIMENSIONS,
	CONCEPT_TAXONOMY,
	DIMENSION_LABELS,
	getAllConceptIds,
	getConceptById,
	getConceptsByDimension,
	getDimensionForConcept,
	groupConceptsByDimension,
} from "./concepts";

describe("CONCEPT_TAXONOMY", () => {
	it("has unique IDs", () => {
		const ids = CONCEPT_TAXONOMY.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("has a non-empty name and description for every concept", () => {
		for (const concept of CONCEPT_TAXONOMY) {
			expect(concept.name.length).toBeGreaterThan(0);
			expect(concept.description.length).toBeGreaterThan(0);
		}
	});

	it("only uses known dimensions", () => {
		for (const concept of CONCEPT_TAXONOMY) {
			expect(CONCEPT_DIMENSIONS).toContain(concept.dimension);
		}
	});
});

describe("getConceptsByDimension", () => {
	it("returns tactical concepts", () => {
		const tactical = getConceptsByDimension("tactical");
		expect(tactical.length).toBeGreaterThan(0);
		for (const c of tactical) {
			expect(c.dimension).toBe("tactical");
		}
	});

	it("returns positional concepts", () => {
		const positional = getConceptsByDimension("positional");
		expect(positional.length).toBeGreaterThan(0);
		for (const c of positional) {
			expect(c.dimension).toBe("positional");
		}
	});

	it("returns empty array for an unknown dimension", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing invalid input
		const result = getConceptsByDimension("nonexistent" as any);
		expect(result).toEqual([]);
	});
});

describe("getDimensionForConcept", () => {
	it("returns the correct dimension for known concepts", () => {
		expect(getDimensionForConcept("fork")).toBe("tactical");
		expect(getDimensionForConcept("pawn-structure")).toBe("positional");
		expect(getDimensionForConcept("development")).toBe("strategic");
		expect(getDimensionForConcept("king-activation")).toBe("endgame");
	});

	it("returns null for unknown concept ID", () => {
		expect(getDimensionForConcept("nonexistent")).toBeNull();
	});
});

describe("getConceptById", () => {
	it("returns the concept for a known ID", () => {
		const concept = getConceptById("fork");
		expect(concept).not.toBeNull();
		expect(concept?.name).toBe("Fork");
		expect(concept?.dimension).toBe("tactical");
	});

	it("returns null for an unknown ID", () => {
		expect(getConceptById("nonexistent")).toBeNull();
	});
});

describe("getAllConceptIds", () => {
	it("returns all concept IDs", () => {
		const ids = getAllConceptIds();
		expect(ids.length).toBe(CONCEPT_TAXONOMY.length);
	});

	it("includes specific known IDs", () => {
		const ids = getAllConceptIds();
		expect(ids).toContain("fork");
		expect(ids).toContain("pawn-structure");
		expect(ids).toContain("king-activation");
	});
});

describe("CONCEPT_DIMENSIONS", () => {
	it("contains all four dimensions in order", () => {
		expect(CONCEPT_DIMENSIONS).toEqual([
			"tactical",
			"positional",
			"strategic",
			"endgame",
		]);
	});
});

describe("DIMENSION_LABELS", () => {
	it("has a label for every dimension", () => {
		for (const dim of CONCEPT_DIMENSIONS) {
			expect(DIMENSION_LABELS[dim]).toBeDefined();
			expect(DIMENSION_LABELS[dim].length).toBeGreaterThan(0);
		}
	});
});

describe("groupConceptsByDimension", () => {
	it("groups concept IDs by their dimension", () => {
		const grouped = groupConceptsByDimension([
			"fork",
			"pin",
			"pawn-structure",
			"king-activation",
		]);
		expect(grouped.get("tactical")?.length).toBe(2);
		expect(grouped.get("positional")?.length).toBe(1);
		expect(grouped.get("endgame")?.length).toBe(1);
		expect(grouped.has("strategic")).toBe(false);
	});

	it("ignores unknown concept IDs", () => {
		const grouped = groupConceptsByDimension(["fork", "nonexistent"]);
		expect(grouped.get("tactical")?.length).toBe(1);
	});

	it("returns empty map for empty input", () => {
		const grouped = groupConceptsByDimension([]);
		expect(grouped.size).toBe(0);
	});
});

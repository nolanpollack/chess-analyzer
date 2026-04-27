import { describe, expect, it } from "vitest";
import { loadLgbmModel, predictLgbm } from "./lgbm-inference";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal LightGBM dump with a single tree and explicit structure. */
function makeLeaf(value: number) {
	return { leaf_value: value };
}

function makeSplit(
	feature: number,
	threshold: number,
	left: object,
	right: object,
	decisionType = "<=",
	defaultLeft = true,
) {
	return {
		split_feature: feature,
		threshold,
		decision_type: decisionType,
		default_left: defaultLeft,
		left_child: left,
		right_child: right,
	};
}

function makeDump(trees: object[], featureNames: string[]) {
	return {
		feature_names: featureNames,
		average_output: false,
		tree_info: trees.map((t, i) => ({
			tree_index: i,
			num_leaves: 2,
			num_cat: 0,
			shrinkage: 1.0,
			tree_structure: t,
		})),
	};
}

// ── Test 1: single stump, left leaf ──────────────────────────────────────────

describe("lgbm-inference", () => {
	it("routes left when feature <= threshold", () => {
		// Feature 0 = 3.0 <= 5.0 → left leaf value 10
		const dump = makeDump(
			[makeSplit(0, 5.0, makeLeaf(10), makeLeaf(20))],
			["x"],
		);
		const model = loadLgbmModel(dump);
		const pred = predictLgbm(model, [3.0]);
		expect(pred).toBeCloseTo(10.0, 6);
	});

	it("routes right when feature > threshold", () => {
		// Feature 0 = 7.0 > 5.0 → right leaf value 20
		const dump = makeDump(
			[makeSplit(0, 5.0, makeLeaf(10), makeLeaf(20))],
			["x"],
		);
		const model = loadLgbmModel(dump);
		const pred = predictLgbm(model, [7.0]);
		expect(pred).toBeCloseTo(20.0, 6);
	});

	it("sums predictions from multiple trees", () => {
		// Two stumps each contributing 100 → sum = 200
		const stump1 = makeSplit(0, 5.0, makeLeaf(100), makeLeaf(50));
		const stump2 = makeSplit(0, 5.0, makeLeaf(100), makeLeaf(50));
		const dump = makeDump([stump1, stump2], ["x"]);
		const model = loadLgbmModel(dump);
		const pred = predictLgbm(model, [0.0]); // goes left in both stumps → 100+100
		expect(pred).toBeCloseTo(200.0, 6);
	});

	it("handles missing (NaN) values by routing default_left=true to left", () => {
		// defaultLeft=true: NaN → left leaf 10
		const dump = makeDump(
			[makeSplit(0, 5.0, makeLeaf(10), makeLeaf(20), "<=", true)],
			["x"],
		);
		const model = loadLgbmModel(dump);
		const pred = predictLgbm(model, [Number.NaN]);
		expect(pred).toBeCloseTo(10.0, 6);
	});

	it("handles missing (NaN) values by routing default_left=false to right", () => {
		// defaultLeft=false: NaN → right leaf 20
		const dump = makeDump(
			[makeSplit(0, 5.0, makeLeaf(10), makeLeaf(20), "<=", false)],
			["x"],
		);
		const model = loadLgbmModel(dump);
		const pred = predictLgbm(model, [Number.NaN]);
		expect(pred).toBeCloseTo(20.0, 6);
	});

	it("walks nested tree correctly", () => {
		// Tree: split on feature 0 at 5.0
		//   left: split on feature 1 at 3.0 → left=1, right=2
		//   right: leaf=9
		const inner = makeSplit(1, 3.0, makeLeaf(1), makeLeaf(2));
		const tree = makeSplit(0, 5.0, inner, makeLeaf(9));
		const dump = makeDump([tree], ["a", "b"]);
		const model = loadLgbmModel(dump);

		expect(predictLgbm(model, [0.0, 0.0])).toBeCloseTo(1.0, 6); // left→left
		expect(predictLgbm(model, [0.0, 5.0])).toBeCloseTo(2.0, 6); // left→right
		expect(predictLgbm(model, [8.0, 0.0])).toBeCloseTo(9.0, 6); // right
	});

	it("uses feature index not position for multi-feature models", () => {
		// Split on feature 1 (second feature), threshold 0.5
		const dump = makeDump(
			[makeSplit(1, 0.5, makeLeaf(100), makeLeaf(200))],
			["a", "b"],
		);
		const model = loadLgbmModel(dump);

		// b=0.0 → left (100)
		expect(predictLgbm(model, [999.0, 0.0])).toBeCloseTo(100.0, 6);
		// b=1.0 → right (200)
		expect(predictLgbm(model, [0.0, 1.0])).toBeCloseTo(200.0, 6);
	});

	it("handles average_output=true by dividing sum by tree count", () => {
		const stump1 = makeSplit(0, 5.0, makeLeaf(100), makeLeaf(50));
		const stump2 = makeSplit(0, 5.0, makeLeaf(100), makeLeaf(50));
		const dump = { ...makeDump([stump1, stump2], ["x"]), average_output: true };
		const model = loadLgbmModel(dump);
		// Both → left → 100+100=200, averaged → 100
		const pred = predictLgbm(model, [0.0]);
		expect(pred).toBeCloseTo(100.0, 6);
	});

	it("throws on invalid dump (missing tree_info)", () => {
		expect(() => loadLgbmModel({})).toThrow("Invalid LightGBM dump");
	});
});

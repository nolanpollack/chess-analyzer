/**
 * Pure-TypeScript LightGBM tree-walk inference.
 *
 * Reads the portable JSON dump produced by `booster.dump_model()` and
 * predicts on a numeric feature vector. Supports:
 *   - Numeric splits (decision_type "<=")
 *   - Categorical splits (decision_type "==" or "=") — membership in
 *     comma-separated threshold values
 *   - Missing-value routing via default_left
 *
 * All features are numeric for Phase 3 (one-hot TC columns), but
 * categorical splits are handled defensively.
 *
 * Feature vector order must match model.feature_names exactly.
 */

// ── Raw dump types ────────────────────────────────────────────────────────────

type RawNode = {
	split_index?: number;
	split_feature?: number;
	split_gain?: number;
	threshold?: number | string;
	decision_type?: string;
	default_left?: boolean;
	left_child?: RawNode;
	right_child?: RawNode;
	leaf_index?: number;
	leaf_value?: number;
};

type RawTree = {
	tree_index: number;
	num_leaves: number;
	num_cat: number;
	shrinkage: number;
	tree_structure: RawNode;
};

type RawModelDump = {
	name?: string;
	version?: string;
	num_class?: number;
	num_tree_per_iteration?: number;
	label_index?: number;
	max_feature_idx?: number;
	feature_names?: string[];
	objective?: string | { name: string };
	average_output?: boolean;
	tree_info?: RawTree[];
	[key: string]: unknown;
};

// ── Public types ──────────────────────────────────────────────────────────────

/** Internal compiled representation of a single tree node. */
type InternalNode =
	| {
			kind: "split";
			featureIdx: number;
			threshold: number;
			decisionType: "<=" | "==" | "=";
			defaultLeft: boolean;
			/** Comma-separated category values for categorical splits. */
			categoricalValues: Set<string>;
			left: InternalNode;
			right: InternalNode;
	  }
	| {
			kind: "leaf";
			value: number;
	  };

/** Compiled model ready for inference. */
export type LgbmModel = {
	featureNames: string[];
	shrinkage: number;
	averageOutput: boolean;
	trees: InternalNode[];
};

// ── Model loading ─────────────────────────────────────────────────────────────

function compileNode(raw: RawNode): InternalNode {
	// Leaf node: no split_index (or no left_child)
	if (raw.leaf_value !== undefined && raw.left_child === undefined) {
		return { kind: "leaf", value: raw.leaf_value };
	}

	// Internal split node
	if (
		raw.split_feature === undefined ||
		raw.threshold === undefined ||
		raw.left_child === undefined ||
		raw.right_child === undefined
	) {
		// Fallback: treat as zero-value leaf
		return { kind: "leaf", value: raw.leaf_value ?? 0 };
	}

	const dt = (raw.decision_type ?? "<=") as string;
	const isCategorical = dt === "==" || dt === "=";

	let numericThreshold = 0;
	let categoricalValues = new Set<string>();

	if (isCategorical) {
		const rawStr = String(raw.threshold);
		categoricalValues = new Set(rawStr.split("||"));
	} else {
		numericThreshold =
			typeof raw.threshold === "number" ? raw.threshold : Number(raw.threshold);
	}

	return {
		kind: "split",
		featureIdx: raw.split_feature,
		threshold: numericThreshold,
		decisionType: dt as "<=" | "==" | "=",
		defaultLeft: raw.default_left ?? false,
		categoricalValues,
		left: compileNode(raw.left_child),
		right: compileNode(raw.right_child),
	};
}

/**
 * Load and compile a LightGBM JSON dump into an efficient inference structure.
 * The `json` argument should be the parsed output of `booster.dump_model()`.
 */
export function loadLgbmModel(json: unknown): LgbmModel {
	const dump = json as RawModelDump;

	if (!dump.tree_info || !Array.isArray(dump.tree_info)) {
		throw new Error("Invalid LightGBM dump: missing tree_info array");
	}

	const featureNames = dump.feature_names ?? [];
	const shrinkage = 1.0; // individual tree shrinkage is baked into leaf values by LightGBM
	const averageOutput = dump.average_output ?? false;

	const trees: InternalNode[] = dump.tree_info.map((rawTree) => {
		if (!rawTree.tree_structure) {
			throw new Error(`Tree ${rawTree.tree_index} has no tree_structure`);
		}
		return compileNode(rawTree.tree_structure);
	});

	return { featureNames, shrinkage, averageOutput, trees };
}

// ── Inference ─────────────────────────────────────────────────────────────────

function walkNode(node: InternalNode, features: number[]): number {
	if (node.kind === "leaf") {
		return node.value;
	}

	const val = features[node.featureIdx];
	const isMissing = val === undefined || val === null || Number.isNaN(val);

	if (isMissing) {
		const child = node.defaultLeft ? node.left : node.right;
		return walkNode(child, features);
	}

	if (node.decisionType === "<=" || node.decisionType === "<") {
		const goLeft = val <= node.threshold;
		return walkNode(goLeft ? node.left : node.right, features);
	}

	// Categorical: go left if value (stringified) is in the set
	const strVal = String(val);
	const goLeft = node.categoricalValues.has(strVal);
	return walkNode(goLeft ? node.left : node.right, features);
}

/**
 * Predict on a numeric feature vector.
 *
 * The feature vector must be ordered to match `model.featureNames`.
 * For Phase 3, this is the same order as FEATURE_NAMES in eval-phase2.ts.
 */
export function predictLgbm(model: LgbmModel, features: number[]): number {
	let sum = 0;
	for (const tree of model.trees) {
		sum += walkNode(tree, features);
	}
	if (model.averageOutput && model.trees.length > 0) {
		sum /= model.trees.length;
	}
	return sum;
}

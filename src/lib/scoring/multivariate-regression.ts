/**
 * Ordinary least squares (OLS) multivariate linear regression.
 *
 * Implements β = (XᵀX + λI)⁻¹ Xᵀy via normal equations.
 * A small ridge term λ=1e-6 is added for numerical stability (near-singular
 * feature matrices when features are collinear).
 *
 * Callers are responsible for:
 * - Feature scaling / one-hot encoding before calling fitOLS.
 * - Handling missing values (e.g. substituting zeros + a binary flag column).
 */

/** Ridge regularization constant (tiny, for numerical stability only). */
const RIDGE_LAMBDA = 1e-6;

export type LinearModel = {
	/** [intercept, coef_0, coef_1, ...] — length = 1 + featureNames.length */
	coefficients: number[];
	featureNames: string[];
	trainR2: number;
	trainN: number;
};

// ── Matrix helpers ────────────────────────────────────────────────────────────

/** Matrix: row-major 2-D number array. */
type Matrix = number[][];

/** Prepend a column of ones (intercept term) to a feature matrix. */
function addInterceptColumn(X: Matrix): Matrix {
	return X.map((row) => [1, ...row]);
}

/** Transpose a matrix. */
function transpose(A: Matrix): Matrix {
	const rows = A.length;
	const cols = A[0].length;
	const out: Matrix = Array.from({ length: cols }, () =>
		new Array(rows).fill(0),
	);
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			out[j][i] = A[i][j];
		}
	}
	return out;
}

/** Multiply two matrices. */
function matMul(A: Matrix, B: Matrix): Matrix {
	const m = A.length;
	const k = A[0].length;
	const n = B[0].length;
	const out: Matrix = Array.from({ length: m }, () => new Array(n).fill(0));
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0;
			for (let p = 0; p < k; p++) sum += A[i][p] * B[p][j];
			out[i][j] = sum;
		}
	}
	return out;
}

/** Multiply matrix A by column vector v. Returns a column vector. */
function matVecMul(A: Matrix, v: number[]): number[] {
	return A.map((row) => row.reduce((s, a, j) => s + a * v[j], 0));
}

/**
 * Invert a square matrix using Gaussian elimination with partial pivoting.
 * Adds ridge term λ to diagonal before inversion for numerical stability.
 */
function invertWithRidge(A: Matrix, lambda = RIDGE_LAMBDA): Matrix {
	const n = A.length;
	// Augmented matrix [A + λI | I]
	const aug: number[][] = A.map((row, i) =>
		row
			.map((v, j) => (i === j ? v + lambda : v))
			.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))),
	);

	for (let col = 0; col < n; col++) {
		// Partial pivot
		let maxRow = col;
		let maxVal = Math.abs(aug[col][col]);
		for (let row = col + 1; row < n; row++) {
			if (Math.abs(aug[row][col]) > maxVal) {
				maxVal = Math.abs(aug[row][col]);
				maxRow = row;
			}
		}
		[aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

		const pivot = aug[col][col];
		if (Math.abs(pivot) < 1e-14) {
			throw new Error(`Matrix is singular at column ${col}`);
		}
		for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;

		for (let row = 0; row < n; row++) {
			if (row === col) continue;
			const factor = aug[row][col];
			for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
		}
	}

	return aug.map((row) => row.slice(n));
}

// ── OLS fit ───────────────────────────────────────────────────────────────────

/**
 * Fit OLS regression: β = (XᵀX + λI)⁻¹ Xᵀy.
 *
 * @param X - [n, k] feature matrix (raw, no intercept column)
 * @param y - [n] target vector
 * @param featureNames - labels for each column of X (length k)
 */
export function fitOLS(
	X: number[][],
	y: number[],
	featureNames: string[],
): LinearModel {
	if (X.length === 0) throw new Error("fitOLS: empty dataset");
	if (X.length !== y.length) throw new Error("fitOLS: X rows != y length");
	if (X[0].length !== featureNames.length) {
		throw new Error("fitOLS: X columns != featureNames length");
	}

	const n = X.length;
	const Xaug = addInterceptColumn(X); // [n, k+1]
	const Xt = transpose(Xaug); // [k+1, n]
	const XtX = matMul(Xt, Xaug); // [k+1, k+1]
	const XtXinv = invertWithRidge(XtX); // [k+1, k+1]
	const Xty = matVecMul(Xt, y); // [k+1]
	const beta = matVecMul(XtXinv, Xty); // [k+1]  (intercept first)

	const trainR2 = computeR2(Xaug, y, beta);

	return {
		coefficients: beta,
		featureNames,
		trainR2,
		trainN: n,
	};
}

/** Compute R² of β on the augmented design matrix (with intercept column). */
function computeR2(Xaug: Matrix, y: number[], beta: number[]): number {
	const n = y.length;
	const meanY = y.reduce((s, v) => s + v, 0) / n;
	let ssTot = 0;
	let ssRes = 0;
	for (let i = 0; i < n; i++) {
		const yHat = Xaug[i].reduce((s, x, j) => s + x * beta[j], 0);
		ssTot += (y[i] - meanY) ** 2;
		ssRes += (y[i] - yHat) ** 2;
	}
	return ssTot > 0 ? 1 - ssRes / ssTot : 0;
}

/**
 * Predict a single target from a feature vector.
 *
 * @param model - fitted LinearModel
 * @param features - raw feature vector (no intercept), length = featureNames.length
 */
export function predict(model: LinearModel, features: number[]): number {
	const { coefficients } = model;
	// coefficients[0] = intercept; coefficients[1..k] = feature weights
	let sum = coefficients[0];
	for (let i = 0; i < features.length; i++) {
		sum += coefficients[i + 1] * features[i];
	}
	return sum;
}

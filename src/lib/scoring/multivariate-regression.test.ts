import { describe, expect, it } from "vitest";
import { fitOLS, predict } from "./multivariate-regression";

describe("fitOLS", () => {
	it("recovers y = 2x + 3 on a univariate example", () => {
		const xs = [0, 1, 2, 3, 4, 5];
		const X = xs.map((x) => [x]);
		const y = xs.map((x) => 2 * x + 3);

		const model = fitOLS(X, y, ["x"]);
		expect(model.coefficients[0]).toBeCloseTo(3, 4); // intercept
		expect(model.coefficients[1]).toBeCloseTo(2, 4); // slope
		expect(model.trainR2).toBeCloseTo(1, 4);
		expect(model.trainN).toBe(6);
	});

	it("fits intercept-only (constant y) correctly", () => {
		const X = [[1], [2], [3], [4]];
		const y = [5, 5, 5, 5];

		const model = fitOLS(X, y, ["x"]);
		// With all y=constant, intercept ≈ 5 and slope ≈ 0
		expect(model.coefficients[0]).toBeCloseTo(5, 3);
		expect(model.coefficients[1]).toBeCloseTo(0, 3);
	});

	it("fits a multivariate linear function y = 1 + 2x1 + 3x2", () => {
		const data = [
			[0, 0],
			[1, 0],
			[0, 1],
			[1, 1],
			[2, 3],
			[3, 2],
		];
		const y = data.map(([x1, x2]) => 1 + 2 * x1 + 3 * x2);

		const model = fitOLS(data, y, ["x1", "x2"]);
		expect(model.coefficients[0]).toBeCloseTo(1, 3); // intercept
		expect(model.coefficients[1]).toBeCloseTo(2, 3); // x1
		expect(model.coefficients[2]).toBeCloseTo(3, 3); // x2
		expect(model.trainR2).toBeCloseTo(1, 4);
	});

	it("predict matches manual computation", () => {
		const X = [[10], [20], [30]];
		const y = [110, 210, 310];
		const model = fitOLS(X, y, ["x"]);

		// slope ≈ 10, intercept ≈ 10 → predict(25) ≈ 260
		const pred = predict(model, [25]);
		expect(pred).toBeCloseTo(260, 0);
	});

	it("handles more features than original two-column example", () => {
		// 5 truly independent features with non-collinear data
		// y = 1 + 2*x0 + 3*x1 (the other 3 features are noise with zero weight)
		const data = [
			[1, 0, 10, 5, 3],
			[2, 1, 7, 2, 8],
			[0, 3, 4, 9, 1],
			[4, 2, 6, 1, 7],
			[3, 5, 2, 8, 4],
			[1, 4, 9, 3, 6],
			[5, 1, 3, 7, 2],
			[2, 3, 8, 4, 5],
			[0, 2, 5, 6, 9],
			[4, 0, 1, 2, 3],
		];
		const y = data.map(([x0, x1]) => 1 + 2 * x0 + 3 * x1);

		const model = fitOLS(data, y, ["x0", "x1", "x2", "x3", "x4"]);
		expect(model.trainR2).toBeGreaterThan(0.99);
		expect(model.featureNames).toHaveLength(5);
		expect(model.coefficients).toHaveLength(6); // intercept + 5 features
		// Primary features should have large coefficients; noise features small
		expect(Math.abs(model.coefficients[1])).toBeGreaterThan(1); // x0 ≈ 2
		expect(Math.abs(model.coefficients[2])).toBeGreaterThan(2); // x1 ≈ 3
	});

	it("throws on empty dataset", () => {
		expect(() => fitOLS([], [], [])).toThrow("empty dataset");
	});

	it("throws when feature names don't match column count", () => {
		expect(() => fitOLS([[1, 2]], [3], ["x1"])).toThrow();
	});
});

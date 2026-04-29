export const DEFAULT_EPSILON = 1e-6;

/**
 * Applies a probability floor to a raw probability value.
 * Returns max(prob, epsilon).
 */
export function applyEpsilon(prob: number, epsilon: number): number {
	return Math.max(prob, epsilon);
}

import { type DimensionType, isValidDimensionValue } from "#/config/dimensions";

/**
 * Throws on any tag whose (dimensionType, dimensionValue) is not in the
 * taxonomy. Generators may produce any string but the runtime rejects
 * unknown values — this is the gate that enforces "taxonomy as code."
 */
export function validateTagValue(
	dimensionType: DimensionType,
	dimensionValue: string,
	generatorName: string,
): void {
	if (!isValidDimensionValue(dimensionType, dimensionValue)) {
		throw new Error(
			`[tagging] Generator ${generatorName} emitted invalid value ` +
				`"${dimensionValue}" for dimension "${dimensionType}". ` +
				`Add it to src/config/dimensions.ts or fix the generator.`,
		);
	}
}

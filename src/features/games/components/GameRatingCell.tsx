/**
 * Per-game rating cell. Renders the rating number plus a horizontal bar
 * that fills left-to-right based on the game's deviation from the player's
 * baseline rating.
 *
 * The bar runs from -SATURATION_ELO (empty) through 0 (half-full, at the
 * baseline tick) to +SATURATION_ELO (fully filled). Colors mirror the
 * deviation:
 * - within ±NEUTRAL_BAND_ELO: yellow (a routine, on-pace game)
 * - above the band: green (over-performed)
 * - below the band: red (under-performed)
 *
 * SATURATION_ELO is tuned so a 100-point swing reads as meaningful
 * (~17% fill movement) without saturating on routine variance.
 */

const SATURATION_ELO = 300;
const NEUTRAL_BAND_ELO = 100;

type GameRatingCellProps = {
	rating: number | null;
	/** Player's overall rating; when null, only the number is shown (no bar). */
	baseline: number | null;
};

export function GameRatingCell({ rating, baseline }: GameRatingCellProps) {
	if (rating === null) {
		return <span className="mono-nums font-mono text-ui text-fg-4">—</span>;
	}

	return (
		<div className="inline-flex items-center gap-2">
			<span className="mono-nums font-mono text-ui text-fg">{rating}</span>
			{baseline !== null && <DeviationBar deviation={rating - baseline} />}
		</div>
	);
}

function DeviationBar({ deviation }: { deviation: number }) {
	const clamped = Math.max(
		-SATURATION_ELO,
		Math.min(SATURATION_ELO, deviation),
	);
	// Map [-SATURATION, +SATURATION] linearly to [0%, 100%] fill width.
	const fillPct = ((clamped + SATURATION_ELO) / (2 * SATURATION_ELO)) * 100;
	const fillClass =
		deviation > NEUTRAL_BAND_ELO
			? "bg-data-6"
			: deviation < -NEUTRAL_BAND_ELO
				? "bg-blunder"
				: "bg-data-3";

	return (
		<span
			aria-hidden="true"
			className="relative inline-block h-1 w-14 rounded-2xs bg-surface-2"
		>
			<span
				className={`absolute inset-y-0 left-0 rounded-2xs ${fillClass}`}
				style={{ width: `${fillPct}%` }}
			/>
		</span>
	);
}

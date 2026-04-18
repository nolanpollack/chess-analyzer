export function AccuracyBar({
	accuracy,
	diff,
}: {
	accuracy: number;
	diff: number;
}) {
	const fillColor = getAccuracyColor(diff);

	return (
		<div className="mt-0.5 mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
			<div
				className="h-full rounded-full"
				style={{
					backgroundColor: fillColor,
					width: `${Math.min(accuracy, 100)}%`,
				}}
			/>
		</div>
	);
}

export function getAccuracyColor(diff: number): string {
	if (diff > 10) return "var(--win)";
	if (diff > -5) return "var(--primary)";
	if (diff > -10) return "var(--warning)";
	return "var(--loss)";
}

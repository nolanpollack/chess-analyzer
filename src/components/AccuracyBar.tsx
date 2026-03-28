export function AccuracyBar({
	accuracy,
	diff,
}: {
	accuracy: number;
	diff: number;
}) {
	return (
		<div className="mt-0.5 mb-2 h-1.5 overflow-hidden rounded-full bg-border/50">
			<div
				className={`h-full rounded-full ${getAccuracyColorClass(diff)}`}
				style={{ width: `${Math.min(accuracy, 100)}%` }}
			/>
		</div>
	);
}

export function getAccuracyColorClass(diff: number): string {
	if (diff > 10) return "bg-emerald-500";
	if (diff > -5) return "bg-blue-500";
	if (diff > -10) return "bg-amber-500";
	return "bg-red-500";
}

import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import type { FactorConfidence } from "#/features/profile/types";

const CONFIDENCE_COPY: Record<FactorConfidence, string> = {
	high: "High confidence",
	medium: "Medium confidence",
	low: "Low confidence",
};

type ConfidenceIndicatorProps = {
	confidence: FactorConfidence;
	nPositions: number;
};

export function ConfidenceIndicator({
	confidence,
	nPositions,
}: ConfidenceIndicatorProps) {
	const filled = confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					role="img"
					aria-label={`${CONFIDENCE_COPY[confidence]} based on ${nPositions} positions`}
					className="inline-flex cursor-help items-end gap-0.5"
				>
					<Bar height="h-1.5" filled={filled >= 1} />
					<Bar height="h-2" filled={filled >= 2} />
					<Bar height="h-2.5" filled={filled >= 3} />
				</span>
			</TooltipTrigger>
			<TooltipContent side="top">
				<div className="font-medium">{CONFIDENCE_COPY[confidence]}</div>
				<div className="text-fg-3">
					Score based on {nPositions.toLocaleString()} position
					{nPositions === 1 ? "" : "s"}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}

function Bar({ height, filled }: { height: string; filled: boolean }) {
	return (
		<span
			className={`w-0.75 rounded-sm ${height} ${filled ? "bg-fg-3" : "bg-border-strong"}`}
		/>
	);
}

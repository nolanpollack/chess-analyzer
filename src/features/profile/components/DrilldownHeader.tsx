import { Link } from "@tanstack/react-router";
import { Badge } from "#/components/ui/badge";
import type { DimensionDrilldownData } from "#/features/profile/types";

type DrilldownHeaderProps = {
	username: string;
	data: DimensionDrilldownData;
};

export function DrilldownHeader({ username, data }: DrilldownHeaderProps) {
	return (
		<div className="space-y-3">
			<Link
				to="/$username/profile"
				params={{ username }}
				className="inline-block text-xs text-primary hover:underline"
			>
				&larr; Back to profile
			</Link>

			<div className="space-y-1">
				<div className="flex items-center gap-2">
					<h1 className="text-[22px] font-medium">{data.primary.label}</h1>
					{data.primary.isWeakest && data.primary.weakestLabel && (
						<Badge
							variant="outline"
							className="border-none bg-destructive/15 px-1.5 py-0.5 text-[11px] text-red-700 dark:text-red-300"
						>
							{data.primary.weakestLabel}
						</Badge>
					)}
				</div>
				<p className="text-[13px] text-muted-foreground">
					{data.primary.accuracy}% accuracy &middot; {data.primary.moveCount}{" "}
					moves across {data.primary.gameCount} games &middot; avg{" "}
					{data.primary.avgCpLoss} cp loss
				</p>
			</div>
		</div>
	);
}

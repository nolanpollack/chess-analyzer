import { ArrowDown } from "lucide-react";
import { Tag } from "#/components/ui/tag";
import type { FocusArea } from "#/features/profile/types";

type FocusAreaTileProps = {
	area: FocusArea;
	index: number;
	isLast: boolean;
};

export function FocusAreaTile({ area, index, isLast }: FocusAreaTileProps) {
	return (
		<div
			className={[
				"cursor-pointer p-6 transition-colors duration-100 hover:bg-surface-2",
				!isLast ? "border-r border-divider" : "",
			].join(" ")}
		>
			<div className="mb-2.5 flex items-center gap-2">
				<span className="font-mono text-2xs text-fg-4">0{index + 1}</span>
				<span className="ml-auto inline-flex items-center gap-1 rounded-[4px] bg-tint-blunder px-1.5 py-0.5 font-mono text-2xs font-medium text-blunder">
					<ArrowDown className="size-2.5" />
					{area.gap} vs overall
				</span>
			</div>
			<div className="mb-2 text-base font-medium leading-tight tracking-[-0.01em] text-fg">
				{area.title}
			</div>
			<p className="mb-3.5 text-[12.5px] leading-[1.55] text-fg-2">
				{area.detail}
			</p>
			<div className="flex flex-wrap items-center gap-1.5">
				{area.factors.map((factor) => (
					<Tag key={factor}>{factor}</Tag>
				))}
				<span className="ml-auto font-mono text-2xs text-fg-3">
					{area.positions} positions
				</span>
			</div>
		</div>
	);
}

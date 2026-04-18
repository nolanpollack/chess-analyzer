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
				"cursor-pointer p-6 transition-colors duration-[120ms] hover:bg-surface-2",
				!isLast ? "border-r border-divider" : "",
			].join(" ")}
		>
			<div className="mb-[10px] flex items-center gap-2">
				<span className="font-mono text-[11px] text-fg-4">0{index + 1}</span>
				<span className="ml-auto inline-flex items-center gap-1 rounded-[4px] bg-tint-blunder px-[6px] py-[2px] font-mono text-[11px] font-medium text-blunder">
					<ArrowDown className="h-[10px] w-[10px]" />
					{area.gap} vs overall
				</span>
			</div>
			<div className="mb-2 text-[16px] font-medium leading-tight tracking-[-0.01em] text-fg">
				{area.title}
			</div>
			<p className="mb-[14px] text-[12.5px] leading-[1.55] text-fg-2">
				{area.detail}
			</p>
			<div className="flex flex-wrap items-center gap-[6px]">
				{area.factors.map((factor) => (
					<Tag key={factor}>{factor}</Tag>
				))}
				<span className="ml-auto font-mono text-[11px] text-fg-3">
					{area.positions} positions
				</span>
			</div>
		</div>
	);
}

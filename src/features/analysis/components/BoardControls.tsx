import {
	ChevronFirst,
	ChevronLast,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";
import { Button } from "#/components/ui/button";

type BoardControlsProps = {
	onFirst: () => void;
	onPrev: () => void;
	onNext: () => void;
	onLast: () => void;
	canGoPrev: boolean;
	canGoNext: boolean;
};

export function BoardControls({
	onFirst,
	onPrev,
	onNext,
	onLast,
	canGoPrev,
	canGoNext,
}: BoardControlsProps) {
	return (
		<div className="flex items-center justify-center gap-1">
			<Button
				variant="outline"
				size="sm"
				onClick={onFirst}
				disabled={!canGoPrev}
				aria-label="First move"
			>
				<ChevronFirst className="size-4" />
			</Button>
			<Button
				variant="outline"
				size="sm"
				onClick={onPrev}
				disabled={!canGoPrev}
				aria-label="Previous move"
			>
				<ChevronLeft className="size-4" />
			</Button>
			<Button
				variant="outline"
				size="sm"
				onClick={onNext}
				disabled={!canGoNext}
				aria-label="Next move"
			>
				<ChevronRight className="size-4" />
			</Button>
			<Button
				variant="outline"
				size="sm"
				onClick={onLast}
				disabled={!canGoNext}
				aria-label="Last move"
			>
				<ChevronLast className="size-4" />
			</Button>
		</div>
	);
}

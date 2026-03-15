import { Skeleton } from "#/components/ui/skeleton";

export function GameDetailSkeleton() {
	return (
		<div className="space-y-6">
			{/* Header */}
			<Skeleton className="h-8 w-64" />

			{/* Two-column layout */}
			<div className="grid grid-cols-1 gap-6 md:grid-cols-[3fr_4fr]">
				{/* Left column: board + controls */}
				<div className="flex flex-col gap-3">
					<Skeleton className="aspect-square w-full rounded-md" />
					<Skeleton className="mx-auto h-8 w-40" />
				</div>

				{/* Right column: eval graph + move list */}
				<div className="flex flex-col gap-4">
					<Skeleton className="h-[140px] w-full rounded-md" />
					<Skeleton className="h-[300px] w-full rounded-md" />
				</div>
			</div>
		</div>
	);
}

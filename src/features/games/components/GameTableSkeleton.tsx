import { Skeleton } from "#/components/ui/skeleton";

export function GameTableSkeleton() {
	return (
		<div className="space-y-2">
			{"sk-0 sk-1 sk-2 sk-3 sk-4 sk-5 sk-6 sk-7 sk-8 sk-9"
				.split(" ")
				.map((k) => (
					<Skeleton key={k} className="h-12 w-full" />
				))}
		</div>
	);
}

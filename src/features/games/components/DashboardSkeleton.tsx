import { Skeleton } from "#/components/ui/skeleton";

export function DashboardSkeleton() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-8 w-48" />
			<div className="flex gap-2">
				<Skeleton className="h-10 w-[140px]" />
				<Skeleton className="h-10 w-[120px]" />
				<Skeleton className="h-10 w-[120px]" />
			</div>
			<div className="space-y-2">
				{"sk-0 sk-1 sk-2 sk-3 sk-4 sk-5 sk-6 sk-7 sk-8 sk-9"
					.split(" ")
					.map((k) => (
						<Skeleton key={k} className="h-12 w-full" />
					))}
			</div>
		</div>
	);
}

import { Card, CardContent, CardHeader } from "#/components/ui/card";

export function ProfileSkeleton() {
	return (
		<div className="animate-pulse space-y-6 p-6">
			<div className="flex items-start justify-between">
				<div>
					<div className="h-6 w-40 rounded bg-muted" />
					<div className="mt-2 h-4 w-56 rounded bg-muted" />
				</div>
				<div className="h-4 w-24 rounded bg-muted" />
			</div>

			<div className="grid grid-cols-3 gap-3">
				{[1, 2, 3].map((i) => (
					<div key={i} className="rounded-md bg-muted p-4">
						<div className="mb-2 h-3 w-20 rounded bg-muted-foreground/10" />
						<div className="h-6 w-12 rounded bg-muted-foreground/10" />
					</div>
				))}
			</div>

			<div className="grid grid-cols-2 gap-3">
				{[1, 2, 3, 4].map((i) => (
					<Card key={i}>
						<CardHeader>
							<div className="h-4 w-24 rounded bg-muted" />
						</CardHeader>
						<CardContent>
							<div className="space-y-3">
								{[1, 2, 3].map((j) => (
									<div key={j} className="h-3 w-full rounded bg-muted" />
								))}
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}

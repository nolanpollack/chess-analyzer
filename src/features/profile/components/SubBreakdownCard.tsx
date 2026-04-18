import { AccuracyBar } from "#/components/AccuracyBar";

type AccuracyRow = {
	key: string;
	label: string;
	accuracy: number;
	supportingText?: string;
	badge?: string;
};

type MissRow = {
	key: string;
	label: string;
	missCount: number;
	totalCount: number;
};

type SubBreakdownCardProps = {
	title: string;
	overallAccuracy: number;
	rows: AccuracyRow[] | MissRow[];
	note?: string;
	emptyText?: string;
	isConcept?: boolean;
	selectedKey?: string | null;
	onConceptRowClick?: (key: string) => void;
};

export function SubBreakdownCard({
	title,
	overallAccuracy,
	rows,
	note,
	emptyText,
	isConcept = false,
	selectedKey,
	onConceptRowClick,
}: SubBreakdownCardProps) {
	return (
		<div className="rounded-lg border border-border bg-card p-5">
			<h2 className="mb-3 text-[15px] font-medium">{title}</h2>
			{note && <p className="mb-3 text-[13px] text-muted-foreground">{note}</p>}

			{rows.length === 0 ? (
				<p className="text-[13px] text-muted-foreground">
					{emptyText ?? "No data"}
				</p>
			) : isConcept ? (
				<div>
					{(rows as MissRow[]).map((row) => (
						<button
							type="button"
							key={row.key}
							onClick={() => onConceptRowClick?.(row.key)}
							className={`flex w-full items-center justify-between border-b border-border/50 py-2 text-left last:border-0 ${
								onConceptRowClick
									? "cursor-pointer rounded px-1 transition-colors hover:bg-muted/50"
									: ""
							}`}
						>
							<div className="flex items-center gap-2">
								<span className="text-sm">{row.label}</span>
								{selectedKey === row.key && (
									<span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
										selected
									</span>
								)}
							</div>
							<span className="text-sm font-medium">
								{row.missCount} misses
							</span>
						</button>
					))}
				</div>
			) : (
				<div>
					{(rows as AccuracyRow[]).map((row) => {
						const diff = row.accuracy - overallAccuracy;
						return (
							<div
								key={row.key}
								className="border-b border-border/50 py-2 last:border-0"
							>
								<div className="mb-1 flex items-center justify-between gap-2">
									<div className="flex items-center gap-1.5">
										<span className="text-sm">{row.label}</span>
										{row.badge && (
											<span className="rounded-md bg-destructive/15 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-300">
												{row.badge}
											</span>
										)}
									</div>
									<div className="flex items-center gap-2">
										{row.supportingText && (
											<span className="text-xs text-muted-foreground">
												{row.supportingText}
											</span>
										)}
										<span className="text-sm font-medium">{row.accuracy}%</span>
									</div>
								</div>
								<AccuracyBar accuracy={row.accuracy} diff={diff} />
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

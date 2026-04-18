import { AccuracyBar } from "#/components/AccuracyBar";
import { Badge } from "#/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";

type DataRow = {
	key: string;
	label: string;
	accuracy: number;
	moveCount: number;
	extra?: string;
	href?: string;
};

type Props = {
	title: string;
	rows: DataRow[];
	overallAccuracy: number;
	note?: string;
};

const MIN_MOVES_FOR_WEAKEST = 5;

export function DimensionCard({ title, rows, overallAccuracy, note }: Props) {
	if (rows.length === 0) return null;

	const weakestKey = findWeakestKey(rows);

	return (
		<Card className="gap-0 py-0">
			<CardHeader className="pb-0 pt-5">
				<CardTitle className="text-[15px] font-medium">{title}</CardTitle>
				{note && <CardDescription>{note}</CardDescription>}
			</CardHeader>
			<CardContent className="pb-5 pt-3">
				{rows.map((row) => (
					<DimensionRow
						key={row.key}
						row={row}
						isWeakest={row.key === weakestKey}
						overallAccuracy={overallAccuracy}
					/>
				))}
			</CardContent>
		</Card>
	);
}

function DimensionRow({
	row,
	isWeakest,
	overallAccuracy,
}: {
	row: DataRow;
	isWeakest: boolean;
	overallAccuracy: number;
}) {
	const diff = row.accuracy - overallAccuracy;
	const isNA = row.extra === "N/A";

	const rowContent = (
		<div
			className={`flex items-center justify-between rounded px-1 py-2 ${row.href ? "cursor-pointer transition-colors hover:bg-muted/50" : ""}`}
		>
			<span className="text-sm">{row.label}</span>
			<div className="flex items-center gap-1.5">
				{isNA ? (
					<span className="text-sm text-muted-foreground">N/A</span>
				) : (
					<>
						<span className="text-sm font-medium">{row.accuracy}%</span>
						{row.extra && (
							<span className="text-xs text-muted-foreground">{row.extra}</span>
						)}
						{isWeakest && (
							<Badge
								variant="outline"
								className="border-none bg-destructive/15 text-[11px] text-red-700 dark:text-red-300"
							>
								weakest
							</Badge>
						)}
					</>
				)}
			</div>
		</div>
	);

	return (
		<div className="border-b border-border/50 last:border-0">
			{row.href ? (
				<a href={row.href} className="block w-full text-left">
					{rowContent}
				</a>
			) : (
				rowContent
			)}
			{!isNA && <AccuracyBar accuracy={row.accuracy} diff={diff} />}
			{!isNA && (
				<div className="pb-2 text-xs text-muted-foreground">
					{row.moveCount} moves &middot; {Math.abs(Math.round(diff))}%{" "}
					{diff >= 0 ? "above" : "below"} average
				</div>
			)}
		</div>
	);
}

function findWeakestKey(rows: DataRow[]): string | null {
	if (rows.length <= 1) return null;
	const eligible = rows.filter((r) => r.moveCount >= MIN_MOVES_FOR_WEAKEST);
	if (eligible.length <= 1) return null;
	let min = eligible[0];
	for (const row of eligible) {
		if (row.accuracy < min.accuracy) min = row;
	}
	return min.key;
}

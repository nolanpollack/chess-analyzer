import { useState } from "react";
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
};

type Props = {
	title: string;
	rows: DataRow[];
	overallAccuracy: number;
	note?: string;
};

const MIN_MOVES_FOR_WEAKEST = 5;

export function DimensionCard({ title, rows, overallAccuracy, note }: Props) {
	const [expanded, setExpanded] = useState<string | null>(null);

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
						isExpanded={expanded === row.key}
						onToggle={() => setExpanded(expanded === row.key ? null : row.key)}
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
	isExpanded,
	onToggle,
}: {
	row: DataRow;
	isWeakest: boolean;
	overallAccuracy: number;
	isExpanded: boolean;
	onToggle: () => void;
}) {
	const diff = row.accuracy - overallAccuracy;
	const isNA = row.extra === "N/A";

	return (
		<div className="border-b border-border/50 last:border-0">
			<button
				type="button"
				className="flex w-full items-center justify-between py-2"
				onClick={onToggle}
			>
				<span className="text-sm">{row.label}</span>
				<div className="flex items-center gap-1.5">
					{isNA ? (
						<span className="text-sm text-muted-foreground">N/A</span>
					) : (
						<>
							<span className="text-sm font-medium">{row.accuracy}%</span>
							{row.extra && (
								<span className="text-xs text-muted-foreground">
									{row.extra}
								</span>
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
			</button>
			{!isNA && <AccuracyBar accuracy={row.accuracy} diff={diff} />}
			{isExpanded && !isNA && (
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
	for (const r of eligible) {
		if (r.accuracy < min.accuracy) min = r;
	}
	return min.key;
}

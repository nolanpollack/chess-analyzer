import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { GamesQueryFilters } from "#/features/games/hooks/use-games";

type GamesFilterBarProps = {
	filters: GamesQueryFilters;
	onChange: (next: GamesQueryFilters) => void;
};

const RESULT_OPTIONS = [
	{ value: "win" as const, label: "Win", dotClass: "bg-data-6" },
	{ value: "draw" as const, label: "Draw", dotClass: "bg-fg-3" },
	{ value: "loss" as const, label: "Loss", dotClass: "bg-blunder" },
];

const COLOR_OPTIONS = [
	{ value: "white" as const, label: "White", swatchClass: "bg-surface-3" },
	{ value: "black" as const, label: "Black", swatchClass: "bg-fg-1" },
];

const TIME_OPTIONS = [
	{ value: "bullet" as const, label: "Bullet" },
	{ value: "blitz" as const, label: "Blitz" },
	{ value: "rapid" as const, label: "Rapid" },
	{ value: "classical" as const, label: "Classical" },
];

export function GamesFilterBar({ filters, onChange }: GamesFilterBarProps) {
	const activeCount = countActive(filters);

	const toggleResult = (v: GamesQueryFilters["result"]) =>
		onChange({ ...filters, result: filters.result === v ? undefined : v });
	const toggleColor = (v: GamesQueryFilters["playerColor"]) =>
		onChange({
			...filters,
			playerColor: filters.playerColor === v ? undefined : v,
		});
	const toggleTime = (v: GamesQueryFilters["timeControlClass"]) =>
		onChange({
			...filters,
			timeControlClass: filters.timeControlClass === v ? undefined : v,
		});

	return (
		<div className="mb-3 flex flex-wrap items-center gap-2">
			<OpeningSearch
				value={filters.openingQuery ?? ""}
				onChange={(q) => onChange({ ...filters, openingQuery: q || undefined })}
			/>

			<ChipGroup label="Result">
				{RESULT_OPTIONS.map((o) => (
					<Chip
						key={o.value}
						active={filters.result === o.value}
						onClick={() => toggleResult(o.value)}
						label={o.label}
						leadingDotClass={o.dotClass}
					/>
				))}
			</ChipGroup>

			<ChipGroup label="Color">
				{COLOR_OPTIONS.map((o) => (
					<Chip
						key={o.value}
						active={filters.playerColor === o.value}
						onClick={() => toggleColor(o.value)}
						label={o.label}
						leadingSwatchClass={o.swatchClass}
					/>
				))}
			</ChipGroup>

			<ChipGroup label="Time">
				{TIME_OPTIONS.map((o) => (
					<Chip
						key={o.value}
						active={filters.timeControlClass === o.value}
						onClick={() => toggleTime(o.value)}
						label={o.label}
					/>
				))}
			</ChipGroup>

			{activeCount > 0 && (
				<button
					type="button"
					onClick={() => onChange({})}
					className="inline-flex items-center gap-1 rounded-sm bg-transparent px-2 py-1.5 text-xs text-fg-3 hover:text-fg-1"
				>
					<X className="size-3" /> Clear {activeCount}
				</button>
			)}
		</div>
	);
}

function countActive(f: GamesQueryFilters): number {
	let n = 0;
	if (f.result) n++;
	if (f.playerColor) n++;
	if (f.timeControlClass) n++;
	if (f.openingQuery) n++;
	return n;
}

function OpeningSearch({
	value,
	onChange,
}: {
	value: string;
	onChange: (q: string) => void;
}) {
	const [draft, setDraft] = useState(value);

	// Reset draft when external value changes (e.g. Clear all).
	useEffect(() => {
		setDraft(value);
	}, [value]);

	// Debounce ~250ms before pushing to parent.
	useEffect(() => {
		if (draft === value) return;
		const t = setTimeout(() => onChange(draft.trim()), 250);
		return () => clearTimeout(t);
	}, [draft, value, onChange]);

	return (
		<div className="inline-flex min-w-55 items-center gap-2 rounded-md border border-divider bg-surface px-2.5 py-1.5">
			<Search className="size-3.5 text-fg-3" />
			<input
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				placeholder="Search opening or ECO…"
				className="min-w-0 flex-1 border-0 bg-transparent text-xs text-fg-1 outline-none"
			/>
			{draft && (
				<button
					type="button"
					onClick={() => setDraft("")}
					aria-label="Clear search"
					className="text-fg-3 hover:text-fg-1"
				>
					<X className="size-3" />
				</button>
			)}
		</div>
	);
}

function ChipGroup({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="inline-flex items-center gap-0 rounded-md border border-divider bg-surface p-0.5">
			<span className="px-2 text-2xs font-medium uppercase tracking-label-narrow text-fg-3">
				{label}
			</span>
			{children}
		</div>
	);
}

function Chip({
	active,
	onClick,
	label,
	leadingDotClass,
	leadingSwatchClass,
}: {
	active: boolean;
	onClick: () => void;
	label: string;
	leadingDotClass?: string;
	leadingSwatchClass?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs ${active ? "bg-accent-soft text-accent-brand" : "bg-transparent text-fg-2 hover:text-fg-1"}`}
		>
			{leadingSwatchClass && (
				<span
					className={`size-2 rounded-2xs border border-border-strong ${leadingSwatchClass}`}
				/>
			)}
			{leadingDotClass && (
				<span className={`size-1.5 rounded-full ${leadingDotClass}`} />
			)}
			<span>{label}</span>
		</button>
	);
}

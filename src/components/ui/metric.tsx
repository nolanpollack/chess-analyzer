import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { ReactNode } from "react";

export function MetricLabel({ children }: { children: ReactNode }) {
	return (
		<div className="text-xs-minus font-medium uppercase tracking-label text-fg-3">
			{children}
		</div>
	);
}

type MetricValueSize = "lg" | "md" | "sm";

const VALUE_SIZE_CLASSES: Record<MetricValueSize, string> = {
	lg: "text-5xl tracking-display",
	md: "text-metric-md tracking-metric",
	sm: "text-2xl tracking-tight-2",
};

export function MetricValue({
	children,
	size = "lg",
}: {
	children: ReactNode;
	size?: MetricValueSize;
}) {
	return (
		<div
			className={`font-mono font-medium leading-none text-fg ${VALUE_SIZE_CLASSES[size]}`}
			style={{ fontFeatureSettings: "'zero', 'ss02'" }}
		>
			{children}
		</div>
	);
}

type DeltaDirection = "up" | "down" | "flat";

const DELTA_CLASSES: Record<DeltaDirection, string> = {
	up: "text-data-6 bg-[color-mix(in_srgb,var(--data-6)_12%,transparent)]",
	down: "text-blunder bg-[color-mix(in_srgb,var(--blunder)_12%,transparent)]",
	flat: "text-fg-3 bg-surface-2",
};

export function MetricDelta({
	value,
	label,
}: {
	value: number;
	label?: string;
}) {
	const direction: DeltaDirection =
		value > 0 ? "up" : value < 0 ? "down" : "flat";

	return (
		<span
			className={`inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 font-mono text-xs font-medium ${DELTA_CLASSES[direction]}`}
			style={{ fontFeatureSettings: "'zero', 'ss02'" }}
		>
			{direction === "up" && <ArrowUp className="h-icon-xs w-icon-xs" />}
			{direction === "down" && <ArrowDown className="h-icon-xs w-icon-xs" />}
			{direction === "flat" && <Minus className="h-icon-xs w-icon-xs" />}
			{value > 0 ? `+${value}` : value}
			{label && <span className="text-fg-3">{label}</span>}
		</span>
	);
}

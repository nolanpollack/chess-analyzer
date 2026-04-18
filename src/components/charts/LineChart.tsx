import { useMemo } from "react";

type LineChartProps = {
	data: number[];
	w?: number;
	h?: number;
	color?: string;
	yLabel?: boolean;
	yTicks?: number;
	xLabels?: string[];
};

export function LineChart({
	data,
	w = 560,
	h = 180,
	color = "var(--accent-brand)",
	yLabel = true,
	yTicks = 4,
	xLabels = [],
}: LineChartProps) {
	const { pts, d, fillD, ticks, gradId } = useMemo(() => {
		const pad = { l: 36, r: 8, t: 12, b: 22 };
		const iw = w - pad.l - pad.r;
		const ih = h - pad.t - pad.b;
		const min = Math.floor(Math.min(...data) / 20) * 20 - 10;
		const max = Math.ceil(Math.max(...data) / 20) * 20 + 10;
		const range = Math.max(1, max - min);

		const points = data.map((v, i) => [
			pad.l + (i / (data.length - 1)) * iw,
			pad.t + ih - ((v - min) / range) * ih,
		]);

		const linePath = points
			.map(
				(p, i) =>
					`${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`,
			)
			.join(" ");

		const last = points[points.length - 1];
		const first = points[0];
		const areaPath = `${linePath} L ${last[0]} ${pad.t + ih} L ${first[0]} ${pad.t + ih} Z`;

		const tickMarks = [];
		for (let i = 0; i <= yTicks; i++) {
			const v = min + (range * i) / yTicks;
			const y = pad.t + ih - (i / yTicks) * ih;
			tickMarks.push({ v: Math.round(v), y, pad });
		}

		const id = `lc-${Math.random().toString(36).slice(2, 8)}`;

		return {
			pts: points,
			d: linePath,
			fillD: areaPath,
			ticks: tickMarks,
			gradId: id,
		};
	}, [data, w, h, yTicks]);

	const pad = { l: 36, r: 8, t: 12, b: 22 };
	const iw = w - pad.l - pad.r;
	const lastPt = pts[pts.length - 1];

	return (
		<svg
			role="img"
			aria-label="Rating over time line chart"
			width="100%"
			height={h}
			viewBox={`0 0 ${w} ${h}`}
			preserveAspectRatio="none"
			style={{ display: "block" }}
		>
			<defs>
				<linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
					<stop offset="0%" stopColor={color} stopOpacity="0.20" />
					<stop offset="100%" stopColor={color} stopOpacity="0" />
				</linearGradient>
			</defs>

			{ticks.map((t) => (
				<g key={t.v}>
					<line
						x1={pad.l}
						x2={w - pad.r}
						y1={t.y}
						y2={t.y}
						stroke="var(--divider-token)"
						strokeWidth="1"
					/>
					{yLabel && (
						<text
							x={pad.l - 8}
							y={t.y + 3}
							fontSize="10"
							fill="var(--fg-3)"
							fontFamily="JetBrains Mono"
							textAnchor="end"
						>
							{t.v}
						</text>
					)}
				</g>
			))}

			<path d={fillD} fill={`url(#${gradId})`} />
			<path
				d={d}
				fill="none"
				stroke={color}
				strokeWidth="1.75"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>

			{lastPt && (
				<circle
					cx={lastPt[0]}
					cy={lastPt[1]}
					r="3.5"
					fill="var(--bg)"
					stroke={color}
					strokeWidth="1.75"
				/>
			)}

			{xLabels.map((label, i) => {
				const x = pad.l + (i / (xLabels.length - 1)) * iw;
				return (
					<text
						key={label}
						x={x}
						y={h - 6}
						fontSize="10"
						fill="var(--fg-3)"
						fontFamily="JetBrains Mono"
						textAnchor="middle"
					>
						{label}
					</text>
				);
			})}
		</svg>
	);
}

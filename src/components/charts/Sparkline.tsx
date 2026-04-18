import { useMemo } from "react";

type SparklineProps = {
	data: number[];
	w?: number;
	h?: number;
	color?: string;
	fill?: boolean;
	strokeWidth?: number;
};

export function Sparkline({
	data,
	w = 120,
	h = 28,
	color = "var(--fg)",
	fill = true,
	strokeWidth = 1.5,
}: SparklineProps) {
	const { d, fillD, gradId } = useMemo(() => {
		if (data.length < 2) return { d: "", fillD: "", gradId: "" };

		const min = Math.min(...data);
		const max = Math.max(...data);
		const range = Math.max(1, max - min);

		const pts = data.map((v, i) => [
			(i / (data.length - 1)) * w,
			h - ((v - min) / range) * (h - 4) - 2,
		]);

		const linePath = pts
			.map(
				(p, i) =>
					`${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`,
			)
			.join(" ");

		const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`;
		const id = `spark-${Math.random().toString(36).slice(2, 8)}`;

		return { d: linePath, fillD: areaPath, gradId: id };
	}, [data, w, h]);

	if (data.length < 2) return null;

	return (
		<svg
			role="img"
			aria-label="Sparkline trend"
			width={w}
			height={h}
			viewBox={`0 0 ${w} ${h}`}
			style={{ display: "block" }}
		>
			{fill && (
				<>
					<defs>
						<linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
							<stop offset="0%" stopColor={color} stopOpacity="0.18" />
							<stop offset="100%" stopColor={color} stopOpacity="0" />
						</linearGradient>
					</defs>
					<path d={fillD} fill={`url(#${gradId})`} />
				</>
			)}
			<path
				d={d}
				fill="none"
				stroke={color}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

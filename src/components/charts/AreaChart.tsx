import {
	Area,
	CartesianGrid,
	AreaChart as RechartsAreaChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

type DataPoint = { index: number; value: number; [key: string]: unknown };

type AreaChartProps = {
	data: DataPoint[];
	/** Color for the area stroke and fill. Defaults to the brand accent. */
	color?: string;
	className?: string;
	/** Fixed [min, max] for the Y domain. Defaults to data-driven "auto". */
	yDomain?: [number | "auto", number | "auto"];
	/** Reference line at y=0 (midline). */
	midline?: boolean;
	/** Vertical cursor line at this x index. */
	cursorX?: number;
	/** Called with the data index when the chart is clicked. */
	onClickIndex?: (index: number) => void;
	/** Show or hide axes. Defaults to false for a compact sparkline look. */
	showAxes?: boolean;
	/** Show recharts tooltip on hover. Defaults to false. */
	showTooltip?: boolean;
	/** Format the tooltip value label. */
	tooltipValueFormatter?: (value: number) => string;
};

export function AreaChart({
	data,
	color = "var(--accent-brand)",
	className,
	yDomain = ["auto", "auto"],
	midline = false,
	cursorX,
	onClickIndex,
	showAxes = false,
	showTooltip = false,
	tooltipValueFormatter,
}: AreaChartProps) {
	function handleClick(e: React.MouseEvent<HTMLDivElement>) {
		if (!onClickIndex || data.length === 0) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const x = (e.clientX - rect.left) / rect.width;
		onClickIndex(
			Math.max(0, Math.min(data.length - 1, Math.round(x * (data.length - 1)))),
		);
	}

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: keyboard nav handled by parent (←/→)
		<div
			className={className}
			onClick={onClickIndex ? handleClick : undefined}
			style={{ cursor: onClickIndex ? "pointer" : undefined }}
		>
			<ResponsiveContainer width="100%" height="100%">
				<RechartsAreaChart
					data={data}
					margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
				>
					<defs>
						<linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor={color} stopOpacity={0.15} />
							<stop offset="95%" stopColor={color} stopOpacity={0.02} />
						</linearGradient>
					</defs>

					{showAxes && (
						<>
							<CartesianGrid stroke="var(--divider-token)" vertical={false} />
							<XAxis
								dataKey="index"
								type="number"
								tick={{
									fontSize: 10,
									fill: "var(--fg-3)",
									fontFamily: "JetBrains Mono",
								}}
								axisLine={false}
								tickLine={false}
								domain={["dataMin", "dataMax"]}
							/>
							<YAxis
								tick={{
									fontSize: 10,
									fill: "var(--fg-3)",
									fontFamily: "JetBrains Mono",
								}}
								axisLine={false}
								tickLine={false}
								domain={yDomain}
								width={32}
							/>
						</>
					)}

					{!showAxes && (
						<XAxis
							dataKey="index"
							type="number"
							hide
							domain={["dataMin", "dataMax"]}
						/>
					)}
					{!showAxes && <YAxis hide domain={yDomain} width={0} />}

					{showTooltip && (
						<Tooltip
							contentStyle={{
								background: "var(--bg)",
								border: "1px solid var(--divider-token)",
								borderRadius: 6,
								fontSize: 12,
								fontFamily: "JetBrains Mono",
								color: "var(--fg-1)",
							}}
							cursor={{ stroke: "var(--divider-token)", strokeWidth: 1 }}
							formatter={(value) => {
								const num = typeof value === "number" ? value : Number(value);
								return [
									tooltipValueFormatter
										? tooltipValueFormatter(num)
										: String(num),
									"Eval",
								];
							}}
						/>
					)}

					{midline && (
						<ReferenceLine
							y={0}
							stroke="var(--divider-token)"
							strokeWidth={1}
						/>
					)}

					{cursorX != null && (
						<ReferenceLine
							x={cursorX}
							stroke="var(--accent-brand)"
							strokeWidth={1.5}
						/>
					)}

					<Area
						type="monotone"
						dataKey="value"
						stroke={color}
						strokeWidth={1.5}
						fill="url(#areaFill)"
						dot={false}
						activeDot={
							showTooltip
								? { r: 3, fill: "var(--bg)", stroke: color, strokeWidth: 1.5 }
								: false
						}
						isAnimationActive={false}
					/>
				</RechartsAreaChart>
			</ResponsiveContainer>
		</div>
	);
}

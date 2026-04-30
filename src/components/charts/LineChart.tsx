// components/AppLineChart.tsx
import {
	CartesianGrid,
	Line,
	LineChart as RechartLineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

type DataPoint = { label?: string; value: number; [key: string]: unknown };

type LineChartProps = {
	data: DataPoint[];
	color?: string;
	className?: string;
	/** Recharts XAxis interval. Use a number to skip ticks, or a preset. */
	xTickInterval?: number | "preserveStartEnd" | "preserveStart" | "preserveEnd";
	/** Field on each data point used as the X axis key. Defaults to "label". */
	xDataKey?: string;
	/** Explicit tick values to render on the X axis. When set, recharts uses these literally. */
	xTicks?: Array<string | number>;
	/** Format each X-axis tick value for display. */
	xTickFormatter?: (value: string | number) => string;
	/**
	 * When true, the X axis is a numeric time scale (timestamps in `xDataKey`).
	 * Same date = same x position across renders, so animations are stable.
	 */
	timeAxis?: boolean;
	/** Format the tooltip value (e.g. round to integer). */
	tooltipValueFormatter?: (value: number) => string;
	/** Format the tooltip label (the X axis value at the hovered point). */
	tooltipLabelFormatter?: (label: string | number) => string;
	/** Series name shown in the tooltip; defaults to "Value". */
	tooltipName?: string;
};

export function LineChart({
	data,
	color = "var(--accent-color)",
	className,
	xTickInterval = "preserveStartEnd",
	xDataKey = "label",
	xTicks,
	xTickFormatter,
	timeAxis = false,
	tooltipValueFormatter,
	tooltipLabelFormatter,
	tooltipName = "Value",
}: LineChartProps) {
	return (
		<div className={className}>
			<ResponsiveContainer width="100%" height="100%">
				<RechartLineChart
					data={data}
					margin={{ top: 12, right: 28, bottom: 8, left: 0 }}
				>
					<CartesianGrid stroke="var(--divider-token)" vertical={false} />
					<XAxis
						dataKey={xDataKey}
						type={timeAxis ? "number" : "category"}
						scale={timeAxis ? "time" : "auto"}
						domain={timeAxis ? ["dataMin", "dataMax"] : undefined}
						allowDuplicatedCategory={timeAxis ? undefined : false}
						tick={{
							fontSize: 10,
							fill: "var(--fg-3)",
							fontFamily: "JetBrains Mono",
						}}
						axisLine={false}
						tickLine={false}
						interval={xTicks ? 0 : xTickInterval}
						ticks={xTicks}
						tickFormatter={
							xTickFormatter
								? (v) => xTickFormatter(v as string | number)
								: undefined
						}
						minTickGap={24}
					/>
					<YAxis
						tick={{
							fontSize: 10,
							fill: "var(--fg-3)",
							fontFamily: "JetBrains Mono",
						}}
						axisLine={false}
						tickLine={false}
						domain={["auto", "auto"]}
						width={36}
					/>
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
							const formatted = tooltipValueFormatter
								? tooltipValueFormatter(num)
								: String(num);
							return [formatted, tooltipName];
						}}
						labelFormatter={(label) => {
							if (tooltipLabelFormatter)
								return tooltipLabelFormatter(label as string | number);
							return typeof label === "string" ? label : String(label);
						}}
					/>
					<Line
						type="monotone"
						dataKey="value"
						name={tooltipName}
						stroke={color}
						strokeWidth={1.75}
						dot={false}
						activeDot={{
							r: 3.5,
							fill: "var(--bg)",
							stroke: color,
							strokeWidth: 1.75,
						}}
					/>
				</RechartLineChart>
			</ResponsiveContainer>
		</div>
	);
}

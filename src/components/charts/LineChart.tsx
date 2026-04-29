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

type DataPoint = { label: string; value: number };

type LineChartProps = {
	data: DataPoint[];
	color?: string;
	className?: string;
	/** Recharts XAxis interval. Use a number to skip ticks, or a preset. */
	xTickInterval?: number | "preserveStartEnd" | "preserveStart" | "preserveEnd";
	/** Format the tooltip value (e.g. round to integer). */
	tooltipValueFormatter?: (value: number) => string;
	/** Format the tooltip label (the X axis value at the hovered point). */
	tooltipLabelFormatter?: (label: string) => string;
	/** Series name shown in the tooltip; defaults to "Value". */
	tooltipName?: string;
};

export function LineChart({
	data,
	color = "var(--accent-color)",
	className,
	xTickInterval = "preserveStartEnd",
	tooltipValueFormatter,
	tooltipLabelFormatter,
	tooltipName = "Value",
}: LineChartProps) {
	return (
		<div className={className}>
			<ResponsiveContainer width="100%" height="100%">
				<RechartLineChart
					data={data}
					margin={{ top: 12, right: 8, bottom: 8, left: 0 }}
				>
					<CartesianGrid stroke="var(--divider-token)" vertical={false} />
					<XAxis
						dataKey="label"
						tick={{
							fontSize: 10,
							fill: "var(--fg-3)",
							fontFamily: "JetBrains Mono",
						}}
						axisLine={false}
						tickLine={false}
						interval={xTickInterval}
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
							const str = typeof label === "string" ? label : String(label);
							return tooltipLabelFormatter
								? tooltipLabelFormatter(str)
								: str;
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

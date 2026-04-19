// components/AppLineChart.tsx
import { LineChart as RechartLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type DataPoint = { label: string; value: number };

type LineChartProps = {
  data: DataPoint[];
  color?: string;
  className?: string;
};

export function LineChart({
  data,
  color = "var(--accent-color)",
  className,
}: LineChartProps) {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartLineChart data={data} margin={{ top: 12, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--divider-token)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "var(--fg-3)", fontFamily: "JetBrains Mono" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--fg-3)", fontFamily: "JetBrains Mono" }}
            axisLine={false}
            tickLine={false}
            domain={['auto', 'auto']}
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
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.75}
            dot={false}
            activeDot={{ r: 3.5, fill: "var(--bg)", stroke: color, strokeWidth: 1.75 }}
          />
        </RechartLineChart>
      </ResponsiveContainer>
    </div>
  );
}

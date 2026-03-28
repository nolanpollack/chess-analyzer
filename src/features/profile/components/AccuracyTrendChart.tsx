import {
	Line,
	LineChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { useAccuracyTrend } from "#/features/profile/hooks/use-accuracy-trend";

type Props = {
	username: string;
	overallAccuracy: number;
};

type TrendPoint = {
	gameId: string;
	playedAt: string;
	accuracy: number;
	opponent: string;
};

export function AccuracyTrendChart({ username, overallAccuracy }: Props) {
	const { data, isLoading } = useAccuracyTrend(username);

	if (isLoading) return <TrendSkeleton />;
	if (!data || "error" in data || data.trend.length < 2) return null;

	const points = data.trend;

	return (
		<Card className="gap-0 py-0">
			<CardHeader className="pb-0 pt-5">
				<CardTitle className="text-[15px] font-medium">
					Accuracy trend
				</CardTitle>
				<p className="text-xs text-muted-foreground">
					Last {points.length} games
				</p>
			</CardHeader>
			<CardContent className="relative h-[180px] pb-5 pt-3">
				<div className="absolute inset-x-6 inset-y-3 bottom-5">
					<ResponsiveContainer width="100%" height="100%">
						<LineChart
							data={points}
							margin={{ top: 4, right: 4, bottom: 16, left: 4 }}
						>
							<XAxis
								dataKey="playedAt"
								tick={false}
								axisLine={false}
								tickLine={false}
								height={0}
							/>
							<YAxis
								domain={[0, 100]}
								tick={false}
								axisLine={false}
								tickLine={false}
								width={0}
							/>
							<ReferenceLine
								y={overallAccuracy}
								stroke="hsl(var(--border))"
								strokeWidth={1}
								strokeDasharray="4 2"
							/>
							<Tooltip
								content={({ active, payload }) => {
									if (!active || !payload?.[0]) return null;
									const point = payload[0].payload as TrendPoint;
									return (
										<div className="rounded-md border bg-card px-3 py-1.5 text-xs shadow-sm">
											<span className="font-medium">{point.accuracy}%</span>{" "}
											<span className="text-muted-foreground">
												vs {point.opponent}
											</span>
										</div>
									);
								}}
							/>
							<Line
								type="monotone"
								dataKey="accuracy"
								stroke="hsl(var(--primary))"
								strokeWidth={1.5}
								dot={false}
								activeDot={{
									r: 3,
									stroke: "hsl(var(--primary))",
									strokeWidth: 2,
									fill: "hsl(var(--background))",
								}}
								isAnimationActive={false}
							/>
						</LineChart>
					</ResponsiveContainer>
				</div>
				<div className="absolute inset-x-6 bottom-5 flex justify-between">
					<span className="text-xs text-muted-foreground">Older games</span>
					<span className="text-xs text-muted-foreground">Recent</span>
				</div>
			</CardContent>
		</Card>
	);
}

function TrendSkeleton() {
	return (
		<Card className="animate-pulse gap-0 py-0">
			<CardHeader className="pb-0 pt-5">
				<div className="h-4 w-28 rounded bg-muted" />
				<div className="mt-1 h-3 w-20 rounded bg-muted" />
			</CardHeader>
			<CardContent className="h-[180px] pb-5 pt-3" />
		</Card>
	);
}

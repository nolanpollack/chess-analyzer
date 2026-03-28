import {
	Area,
	AreaChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import type { MoveAnalysis } from "#/db/schema";
import {
	buildEvalGraphData,
	type EvalDataPoint,
	formatEvalDisplay,
} from "#/features/analysis/utils";

type EvalGraphProps = {
	moves: MoveAnalysis[];
	currentPly: number;
	onClickMove: (ply: number) => void;
	playerIsWhite: boolean;
};

export function EvalGraph({
	moves,
	currentPly,
	onClickMove,
	playerIsWhite,
}: EvalGraphProps) {
	const data = buildEvalGraphData(moves, playerIsWhite);

	return (
		<Card className="flex h-[160px] flex-col gap-0 py-0">
			<CardHeader className="px-4 pt-3 pb-2">
				<CardTitle className="text-sm font-medium text-muted-foreground">
					Evaluation
				</CardTitle>
			</CardHeader>
			<CardContent className="relative min-h-0 flex-1 px-4 pb-3">
				<div className="absolute inset-0 px-4 pb-3 [&_svg]:outline-none">
					<ResponsiveContainer width="100%" height="100%">
						<AreaChart
							data={data}
							margin={{ top: 2, right: 4, bottom: 2, left: 4 }}
							onClick={(e: Record<string, unknown>) => {
								const payload = e?.activePayload as
									| { payload: EvalDataPoint }[]
									| undefined;
								if (payload?.[0]) {
									onClickMove(payload[0].payload.ply);
								}
							}}
						>
							<defs>
								<linearGradient id="evalGradient" x1="0" y1="0" x2="0" y2="1">
									<stop
										offset="0%"
										stopColor="var(--color-foreground)"
										stopOpacity={0.2}
									/>
									<stop
										offset="100%"
										stopColor="var(--color-foreground)"
										stopOpacity={0.04}
									/>
								</linearGradient>
							</defs>
							<XAxis
								dataKey="ply"
								tick={false}
								axisLine={false}
								tickLine={false}
								height={0}
							/>
							<YAxis
								domain={[-1, 1]}
								tick={false}
								axisLine={false}
								tickLine={false}
								width={0}
							/>
							<ReferenceLine
								y={0}
								stroke="var(--color-border)"
								strokeWidth={1}
							/>
							{currentPly > 0 && (
								<ReferenceLine
									x={currentPly}
									stroke="var(--color-primary)"
									strokeWidth={2}
									strokeDasharray="4 2"
								/>
							)}
							<Tooltip
								content={({ active, payload }) => {
									if (!active || !payload?.[0]) return null;
									const point = payload[0].payload as EvalDataPoint;
									return (
										<div className="rounded-md border bg-card px-3 py-1.5 text-xs shadow-sm">
											<span className="text-muted-foreground">
												{point.moveNumber}
											</span>{" "}
											<span className="font-medium">
												{formatEvalDisplay(point.evalCp)}
											</span>
										</div>
									);
								}}
							/>
							<Area
								type="monotone"
								dataKey="eval"
								stroke="var(--color-foreground)"
								strokeWidth={1.5}
								fill="url(#evalGradient)"
								dot={(props: Record<string, unknown>) => {
									const { cx, cy, payload } = props as {
										cx: number;
										cy: number;
										payload: EvalDataPoint;
									};
									if (
										payload.classification === "blunder" ||
										payload.classification === "mistake"
									) {
										const color =
											payload.classification === "blunder"
												? "var(--color-loss)"
												: "oklch(0.769 0.188 70.08)";
										return (
											<circle
												key={payload.ply}
												cx={cx}
												cy={cy}
												r={3}
												fill={color}
												stroke="none"
											/>
										);
									}
									return <g key={payload.ply} />;
								}}
								activeDot={{
									r: 4,
									stroke: "var(--color-primary)",
									strokeWidth: 2,
									fill: "var(--color-background)",
								}}
								isAnimationActive={false}
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			</CardContent>
		</Card>
	);
}

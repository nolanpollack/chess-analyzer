import {
	Area,
	AreaChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { MoveAnalysis } from "#/db/schema";
import { formatEvalDisplay } from "#/features/analysis/utils";

/**
 * Maps centipawns to [-1, 1] using a tanh sigmoid.
 * 0 = equal, +1 = player winning, -1 = player losing.
 * +400cp ≈ +0.76, +200cp ≈ +0.46, 0cp = 0
 */
function evalToWinPct(cp: number): number {
	return Math.tanh(cp / 400);
}

type EvalGraphProps = {
	moves: MoveAnalysis[];
	currentPly: number;
	onClickMove: (ply: number) => void;
	/** Whether to display eval from the player's perspective */
	playerIsWhite: boolean;
};

type DataPoint = {
	ply: number;
	moveNumber: string;
	eval: number; // win probability [0, 1]
	evalCp: number; // raw centipawns for tooltip
	classification: string;
};

export function EvalGraph({
	moves,
	currentPly,
	onClickMove,
	playerIsWhite,
}: EvalGraphProps) {
	const data: DataPoint[] = moves.map((move) => {
		const evalCp = playerIsWhite ? move.eval_after : -move.eval_after;

		return {
			ply: move.ply,
			moveNumber:
				move.ply % 2 === 1
					? `${Math.ceil(move.ply / 2)}.`
					: `${Math.ceil(move.ply / 2)}...`,
			eval: evalToWinPct(evalCp),
			evalCp,
			classification: move.classification,
		};
	});

	function handleClick(point: DataPoint | null) {
		if (point) {
			onClickMove(point.ply);
		}
	}

	return (
		<div className="flex h-[160px] flex-col rounded-lg border bg-card px-4 py-3">
			<p className="mb-2 shrink-0 text-sm font-medium text-muted-foreground">
				Evaluation
			</p>
			{/* Absolute wrapper is required: ResponsiveContainer height="100%" doesn't resolve from flex-1 parents */}
			<div className="relative min-h-0 flex-1 w-full">
				<div className="absolute inset-0 [&_svg]:outline-none">
					<ResponsiveContainer width="100%" height="100%">
						<AreaChart
							data={data}
							margin={{ top: 2, right: 4, bottom: 2, left: 4 }}
							onClick={(e: Record<string, unknown>) => {
								const payload = e?.activePayload as
									| { payload: DataPoint }[]
									| undefined;
								if (payload?.[0]) {
									handleClick(payload[0].payload);
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
							{/* Equal position reference line at 50% */}
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
									const point = payload[0].payload as DataPoint;
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
										payload: DataPoint;
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
			</div>
		</div>
	);
}

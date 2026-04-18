import type {
	getDimensionDrilldown,
	getGamePerformance,
	getPlayerProfile,
} from "#/server/profile";

type GamePerformanceResult = Awaited<ReturnType<typeof getGamePerformance>>;
type PlayerProfileResult = Awaited<ReturnType<typeof getPlayerProfile>>;
type DimensionDrilldownResult = Awaited<
	ReturnType<typeof getDimensionDrilldown>
>;

export type GamePerformanceData = NonNullable<
	Exclude<GamePerformanceResult, { error: string }>["performance"]
>;

export type PlayerProfileData = NonNullable<
	Exclude<PlayerProfileResult, { error: string }>["profile"]
>;

export type DimensionDrilldownData = NonNullable<
	Exclude<DimensionDrilldownResult, { error: string }>["drilldown"]
>;

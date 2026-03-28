import type { getGamePerformance, getPlayerProfile } from "#/server/profile";

type GamePerformanceResult = Awaited<ReturnType<typeof getGamePerformance>>;
type PlayerProfileResult = Awaited<ReturnType<typeof getPlayerProfile>>;

export type GamePerformanceData = NonNullable<
	Exclude<GamePerformanceResult, { error: string }>["performance"]
>;

export type PlayerProfileData = NonNullable<
	Exclude<PlayerProfileResult, { error: string }>["profile"]
>;

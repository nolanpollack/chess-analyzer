import type { getPlayerStatus } from "#/features/players/server/queries";

/**
 * Player DTO — derived from `getPlayerStatus`'s success branch so the
 * wire shape cannot drift from its sole producer. `lastSyncedAt` is an
 * ISO date string (server serialises Date → string at the boundary).
 */
type PlayerStatusResult = Awaited<ReturnType<typeof getPlayerStatus>>;
type PlayerStatusFound = Extract<PlayerStatusResult, { found: true }>;

export type Player = PlayerStatusFound["player"];

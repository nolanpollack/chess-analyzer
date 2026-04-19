import { type QueryKey, useQuery } from "@tanstack/react-query";
import { getPlayerStatus } from "../server/queries";
import { type Player } from "../types";

export const playerStatusQueryKey: (username: string) => QueryKey
  = (username: string) => ["playerStatus", username];

export function useStatusQuery(username: string) {
  return useQuery({
    queryKey: playerStatusQueryKey(username),
    queryFn: () => getPlayerStatus({ data: { username } }),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && "found" in data && data.found && data.isSyncing) return 3000;
      return false;
    },
  })
};

export function usePlayerStatus(username: string): {
  player: Player | null;
  isSyncing: boolean;
  isLoading: boolean;
  error: Error | null;
} {
  const statusQuery = useStatusQuery(username);

  const playerStatus =
    statusQuery.data && "found" in statusQuery.data && statusQuery.data.found
      ? statusQuery.data
      : null;

  return {
    player: playerStatus?.player ?? null,
    isSyncing: playerStatus?.isSyncing ?? false,
    isLoading: statusQuery.isLoading,
    error: statusQuery.error,
  };
}

import { useMutation } from "@tanstack/react-query";
import { syncPlayer } from "../server/mutations";
import { useStatusQuery } from "./use-player-status";

export function useSyncPlayer(username: string) {
	const statusQuery = useStatusQuery(username);

	const syncMutation = useMutation({
		mutationFn: () => syncPlayer({ data: { username } }),
		onSuccess: () => {
			void statusQuery.refetch();
		},
	});

	const sync = () => syncMutation.mutate();

	return { sync };
}

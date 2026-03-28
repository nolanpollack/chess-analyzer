import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getPlayerProfile, refreshPlayerProfile } from "#/server/profile";

export function usePlayerProfile(username: string) {
	return useQuery({
		queryKey: ["playerProfile", username],
		queryFn: () => getPlayerProfile({ data: { username } }),
		enabled: !!username,
	});
}

export function useRefreshProfile(username: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => refreshPlayerProfile({ data: { username } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["playerProfile", username] });
		},
	});
}

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ensurePlayer } from "#/features/players/server/mutations";

export const Route = createFileRoute("/$username")({
	loader: ({ params }) => ensurePlayer({ data: { username: params.username } }),
	component: UsernameLayout,
});

function UsernameLayout() {
	return <Outlet />;
}

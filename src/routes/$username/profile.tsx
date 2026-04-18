import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/$username/profile")({
	component: ProfileLayout,
});

function ProfileLayout() {
	return <Outlet />;
}

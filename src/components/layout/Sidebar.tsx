import { Link, useRouterState } from "@tanstack/react-router";
import { Search, User } from "lucide-react";
import ThemeToggle from "#/components/ThemeToggle";
import { useCurrentPlayer } from "#/lib/use-current-player";

type NavItem = {
	id: string;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	href: string;
};

const NAV_ITEMS: NavItem[] = [
	{ id: "profile", label: "Profile", icon: User, href: "/$username" },
];

function NavLink({ item, username }: { item: NavItem; username: string }) {
	const routerState = useRouterState();
	const resolvedHref = item.href.replace("$username", username);
	const isActive =
		routerState.location.pathname === resolvedHref ||
		routerState.location.pathname === `${resolvedHref}/`;

	return (
		<Link
			to={item.href}
			params={{ username }}
			className={[
				"flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13.5px] font-[450] transition-all duration-[120ms]",
				isActive
					? "bg-surface-2 font-medium text-fg"
					: "text-fg-2 hover:bg-surface-2 hover:text-fg",
			].join(" ")}
		>
			<item.icon
				className={[
					"h-4 w-4 shrink-0",
					isActive ? "opacity-100 text-accent-brand" : "opacity-75",
				].join(" ")}
			/>
			<span>{item.label}</span>
		</Link>
	);
}

function SidebarAvatar({ username }: { username: string }) {
	const initials = username.slice(0, 2).toUpperCase();
	return (
		<div className="bg-avatar-gradient grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold text-white">
			{initials}
		</div>
	);
}

export function Sidebar() {
	const username = useCurrentPlayer();

	return (
		<aside className="flex flex-col border-r border-divider bg-bg px-3 py-5">
			{/* Logo */}
			<div className="flex items-center gap-2.5 px-2.5 pb-5 text-base font-semibold tracking-[-0.02em]">
				<div className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] bg-fg font-mono text-ui font-bold text-bg">
					E
				</div>
				<span>Elo</span>
				<span className="ml-auto font-mono text-[10.5px] text-fg-3">v0.9</span>
			</div>

			{/* Search placeholder */}
			<div className="px-1 pb-2">
				<div className="flex items-center gap-2 rounded-[6px] bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-fg-3">
					<Search className="h-[13px] w-[13px]" />
					<span>Search</span>
					<span className="ml-auto font-mono text-[10.5px]">⌘K</span>
				</div>
			</div>

			{/* Nav section */}
			<div className="px-2.5 pb-1.5 pt-3.5 text-2xs font-medium uppercase tracking-[0.08em] text-fg-3">
				Your chess
			</div>
			{username &&
				NAV_ITEMS.map((item) => (
					<NavLink key={item.id} item={item} username={username} />
				))}

			{/* Footer */}
			<div className="mt-auto flex items-center gap-2.5 border-t border-divider px-2.5 pt-3">
				{username && <SidebarAvatar username={username} />}
				<div className="flex flex-col text-[12.5px]">
					<span className="font-medium text-fg-1">{username ?? "—"}</span>
					<span className="text-2xs text-fg-3">@{username ?? "—"}</span>
				</div>
				<div className="ml-auto">
					<ThemeToggle />
				</div>
			</div>
		</aside>
	);
}

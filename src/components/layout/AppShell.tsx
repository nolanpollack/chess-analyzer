import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

type AppShellProps = {
	children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
	return (
		<div className="grid h-dvh grid-cols-[240px_1fr] overflow-hidden">
			<Sidebar />
			<main className="relative overflow-y-auto">{children}</main>
		</div>
	);
}

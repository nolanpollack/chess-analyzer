import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

type AppShellProps = {
	children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
	return (
		<div
			className="grid h-dvh overflow-hidden"
			style={{ gridTemplateColumns: "240px 1fr" }}
		>
			<Sidebar />
			<main
				className="relative overflow-y-auto"
				style={{ scrollbarGutter: "stable" }}
			>
				{children}
			</main>
		</div>
	);
}

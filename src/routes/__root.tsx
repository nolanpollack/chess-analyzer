import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { AppShell } from "#/components/layout/AppShell";
import ThemeScript from "#/components/ThemeScript";
import { TooltipProvider } from "#/components/ui/tooltip";
import TanStackQueryProvider from "../integrations/tanstack-query/root-provider";
import appCss from "../styles.css?url";

type MyRouterContext = {
	queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Chess Analyzer" },
		],
		links: [
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;450;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
			},
			{ rel: "stylesheet", href: appCss },
		],
	}),
	component: RootComponent,
	shellComponent: RootDocument,
});

function RootComponent() {
	return <Outlet />;
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<ThemeScript />
				<HeadContent />
			</head>
			<body className="overflow-hidden bg-bg font-sans text-fg antialiased">
				<TanStackQueryProvider>
					<TooltipProvider>
						<AppShell>{children}</AppShell>
					</TooltipProvider>
				</TanStackQueryProvider>
				<Scripts />
			</body>
		</html>
	);
}

import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import Header from "#/components/Header";
import ThemeScript from "#/components/ThemeScript";
import TanStackQueryProvider from "../integrations/tanstack-query/root-provider";
import appCss from "../styles.css?url";

type MyRouterContext = {
	queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Chess Analyzer",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
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
			<body className="flex h-dvh flex-col overflow-hidden bg-background font-sans text-foreground antialiased">
				<TanStackQueryProvider>
					<Header />
					<main className="mx-auto min-h-0 w-full max-w-5xl flex-1 overflow-auto px-2 py-6 md:px-4 md:py-8">
						{children}
					</main>
				</TanStackQueryProvider>
				<Scripts />
			</body>
		</html>
	);
}

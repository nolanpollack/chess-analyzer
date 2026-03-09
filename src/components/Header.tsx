import { Link } from "@tanstack/react-router";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
	return (
		<header className="sticky top-0 z-50 border-b border-border bg-background/95 px-4 backdrop-blur-lg">
			<nav className="mx-auto flex max-w-5xl items-center justify-between py-3">
				<Link
					to="/"
					className="text-lg font-bold tracking-tight text-foreground no-underline"
				>
					Chess Analyzer
				</Link>
				<ThemeToggle />
			</nav>
		</header>
	);
}

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark" | "auto";

function getInitialMode(): ThemeMode {
	if (typeof window === "undefined") return "auto";
	const stored = window.localStorage.getItem("theme");
	if (stored === "light" || stored === "dark" || stored === "auto")
		return stored;
	return "auto";
}

function applyThemeMode(mode: ThemeMode) {
	const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	const resolved = mode === "auto" ? (prefersDark ? "dark" : "light") : mode;

	document.documentElement.classList.remove("light", "dark");
	document.documentElement.classList.add(resolved);

	if (mode === "auto") {
		document.documentElement.removeAttribute("data-theme");
	} else {
		document.documentElement.setAttribute("data-theme", mode);
	}

	document.documentElement.style.colorScheme = resolved;
}

export default function ThemeToggle() {
	const [mode, setMode] = useState<ThemeMode>("auto");

	useEffect(() => {
		const initialMode = getInitialMode();
		setMode(initialMode);
		applyThemeMode(initialMode);
	}, []);

	useEffect(() => {
		if (mode !== "auto") return;
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyThemeMode("auto");
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [mode]);

	function toggleMode() {
		const nextMode: ThemeMode =
			mode === "light" ? "dark" : mode === "dark" ? "auto" : "light";
		setMode(nextMode);
		applyThemeMode(nextMode);
		window.localStorage.setItem("theme", nextMode);
	}

	const isDark =
		mode === "dark" ||
		(mode === "auto" &&
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches);
	const label = `Theme: ${mode}. Click to switch.`;

	return (
		<button
			type="button"
			onClick={toggleMode}
			title={label}
			className="grid h-7 w-7 cursor-pointer place-items-center rounded-[6px] text-fg-3 transition-all duration-[120ms] hover:bg-surface-2 hover:text-fg"
		>
			{isDark ? (
				<Sun className="h-3.5 w-3.5" />
			) : (
				<Moon className="h-3.5 w-3.5" />
			)}
		</button>
	);
}

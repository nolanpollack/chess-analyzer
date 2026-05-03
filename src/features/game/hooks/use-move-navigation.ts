import { useCallback, useEffect, useState } from "react";

export function useMoveNavigation(
	totalMoves: number,
	initialIndex = 0,
	initialFlipped = false,
) {
	const [cursor, setCursor] = useState(initialIndex);
	const [flipped, setFlipped] = useState(initialFlipped);

	const prev = useCallback(() => setCursor((c) => Math.max(0, c - 1)), []);
	const next = useCallback(
		() => setCursor((c) => Math.min(totalMoves - 1, c + 1)),
		[totalMoves],
	);
	const first = useCallback(() => setCursor(0), []);
	const last = useCallback(
		() => setCursor(Math.max(0, totalMoves - 1)),
		[totalMoves],
	);
	const toggleFlip = useCallback(() => setFlipped((f) => !f), []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			if (
				target?.tagName === "INPUT" ||
				target?.tagName === "TEXTAREA" ||
				target?.isContentEditable
			) {
				return;
			}
			if (e.key === "ArrowLeft") {
				e.preventDefault();
				prev();
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				next();
			} else if (e.key === "f" || e.key === "F") {
				toggleFlip();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [prev, next, toggleFlip]);

	return { cursor, setCursor, flipped, prev, next, first, last, toggleFlip };
}

import { useCallback, useEffect, useState } from "react";
import type { MoveAnalysis } from "#/db/schema";

type UseMoveNavigationOptions = {
	moves: MoveAnalysis[];
	/** Enable keyboard navigation */
	enableKeyboard?: boolean;
};

type UseMoveNavigationReturn = {
	/** Current ply index (0 = start position, 1 = after first move, etc.) */
	currentPly: number;
	/** The currently selected move (null if at start position) */
	currentMove: MoveAnalysis | null;
	/** Navigate to a specific ply */
	goToPly: (ply: number) => void;
	/** Go to the first position (before any moves) */
	goToFirst: () => void;
	/** Go to the previous move */
	goToPrev: () => void;
	/** Go to the next move */
	goToNext: () => void;
	/** Go to the last move */
	goToLast: () => void;
	/** Current FEN to display */
	currentFen: string;
};

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function useMoveNavigation({
	moves,
	enableKeyboard = true,
}: UseMoveNavigationOptions): UseMoveNavigationReturn {
	const [currentPly, setCurrentPly] = useState(0);

	const goToPly = useCallback(
		(ply: number) => {
			setCurrentPly(Math.max(0, Math.min(ply, moves.length)));
		},
		[moves.length],
	);

	const goToFirst = useCallback(() => setCurrentPly(0), []);
	const goToPrev = useCallback(
		() => setCurrentPly((prev) => Math.max(0, prev - 1)),
		[],
	);
	const goToNext = useCallback(
		() => setCurrentPly((prev) => Math.min(moves.length, prev + 1)),
		[moves.length],
	);
	const goToLast = useCallback(
		() => setCurrentPly(moves.length),
		[moves.length],
	);

	// Keyboard navigation
	useEffect(() => {
		if (!enableKeyboard) return;

		let gPressed = false;

		function handleKeyDown(e: KeyboardEvent) {
			// Don't capture when an input/textarea is focused
			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.tagName === "SELECT" ||
				target.isContentEditable
			) {
				return;
			}

			switch (e.key) {
				case "ArrowLeft":
				case "h":
					e.preventDefault();
					goToPrev();
					break;
				case "ArrowRight":
				case "l":
					e.preventDefault();
					goToNext();
					break;
				case "Home":
					e.preventDefault();
					goToFirst();
					break;
				case "End":
					e.preventDefault();
					goToLast();
					break;
				case "g":
					if (gPressed) {
						// gg → go to first
						e.preventDefault();
						goToFirst();
						gPressed = false;
					} else {
						gPressed = true;
						setTimeout(() => {
							gPressed = false;
						}, 500);
					}
					break;
				case "G":
					e.preventDefault();
					goToLast();
					break;
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [enableKeyboard, goToFirst, goToLast, goToNext, goToPrev]);

	const currentMove = currentPly > 0 ? (moves[currentPly - 1] ?? null) : null;

	// Compute the FEN for the current position
	const currentFen =
		currentPly === 0
			? (moves[0]?.fen_before ?? STARTING_FEN)
			: (moves[currentPly - 1]?.fen_after ?? STARTING_FEN);

	return {
		currentPly,
		currentMove,
		goToPly,
		goToFirst,
		goToPrev,
		goToNext,
		goToLast,
		currentFen,
	};
}

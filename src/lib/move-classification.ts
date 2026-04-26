import { Chess } from "chess.js";
import { ANALYSIS_CONFIG } from "#/config/analysis";
import type { MoveClassification } from "#/db/schema";
import { cpToWinPct } from "#/lib/analysis/accuracy";

const PIECE_VALUES: Record<string, number> = {
	p: 1,
	n: 3,
	b: 3,
	r: 5,
	q: 9,
};

function countPlayerMaterial(chess: Chess, color: "w" | "b"): number {
	let total = 0;
	for (const row of chess.board()) {
		for (const piece of row) {
			if (piece && piece.color === color) {
				total += PIECE_VALUES[piece.type] ?? 0;
			}
		}
	}
	return total;
}

function isBrilliant(
	fenBefore: string,
	fenAfter: string,
	playerColor: "w" | "b",
	winPctBefore: number,
	winPctAfter: number,
	winPctLost: number,
): boolean {
	const cfg = ANALYSIS_CONFIG.classification;
	if (winPctLost > cfg.brilliantMaxWinLoss) return false;
	if (winPctBefore >= cfg.brilliantMaxWinPctBefore) return false;
	if (winPctAfter < cfg.brilliantMinWinPctAfter) return false;
	const chessBefore = new Chess(fenBefore);
	const chessAfter = new Chess(fenAfter);
	return (
		countPlayerMaterial(chessAfter, playerColor) <
		countPlayerMaterial(chessBefore, playerColor)
	);
}

function isGreat(
	playedUci: string,
	bestUci: string,
	winPctBefore: number,
	winPctAfter: number,
	winPctLost: number,
): boolean {
	const cfg = ANALYSIS_CONFIG.classification;
	return (
		(playedUci === bestUci || winPctLost <= cfg.excellent) &&
		winPctBefore < cfg.greatMaxWinPctBefore &&
		winPctAfter >= cfg.greatMinWinPctAfter &&
		winPctAfter - winPctBefore >= cfg.greatMinWinGain
	);
}

function isMiss(
	winPctBefore: number,
	winPctLost: number,
	prevContext: PrevMoveContext | undefined,
): boolean {
	if (!prevContext) return false;
	const cfg = ANALYSIS_CONFIG.classification;
	return (
		prevContext.opponentWinPctLost >= cfg.missOpponentErrorMin &&
		winPctBefore >= cfg.missPlayerWinPctMin &&
		winPctLost >= cfg.missPlayerDropMin
	);
}

export type PrevMoveContext = {
	opponentWinPctLost: number;
};

export function classifyMove(
	playedUci: string,
	bestUci: string,
	evalBeforeCp: number,
	evalAfterCp: number,
	fenBefore: string,
	fenAfter: string,
	isWhite: boolean,
	prevContext?: PrevMoveContext,
): MoveClassification {
	const winPctBefore = isWhite
		? cpToWinPct(evalBeforeCp)
		: 100 - cpToWinPct(evalBeforeCp);
	const winPctAfter = isWhite
		? cpToWinPct(evalAfterCp)
		: 100 - cpToWinPct(evalAfterCp);
	const winPctLost = Math.max(0, winPctBefore - winPctAfter);
	const playerColor = isWhite ? "w" : "b";

	if (
		isBrilliant(
			fenBefore,
			fenAfter,
			playerColor,
			winPctBefore,
			winPctAfter,
			winPctLost,
		)
	) {
		return "brilliant";
	}
	if (isGreat(playedUci, bestUci, winPctBefore, winPctAfter, winPctLost)) {
		return "great";
	}
	if (playedUci === bestUci) return "best";
	if (isMiss(winPctBefore, winPctLost, prevContext)) return "miss";

	const cfg = ANALYSIS_CONFIG.classification;
	if (winPctLost <= cfg.excellent) return "excellent";
	if (winPctLost <= cfg.good) return "good";
	if (winPctLost <= cfg.inaccuracy) return "inaccuracy";
	if (winPctLost <= cfg.mistake) return "mistake";
	return "blunder";
}

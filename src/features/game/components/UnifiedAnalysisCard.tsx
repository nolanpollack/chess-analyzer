import { ArrowDown, ArrowUp } from "lucide-react";
import { MoveBadge } from "#/components/ui/move-badge";
import { TagLinkList } from "#/components/ui/tag-link";
import { getConceptById } from "#/config/concepts";
import type { AlternativeMove, MoveClassification } from "#/db/schema";
import { useMoveExplanation } from "#/features/explanations/hooks/use-move-explanation";
import { MoveCell } from "#/features/game/components/MoveCell";
import type { FlatMove } from "#/features/game/types";
import { formatEval, isMateScore } from "#/lib/chess-utils";

const ALT_MOVE_THRESHOLD_CP = 30;

type UnifiedAnalysisCardProps = {
	move: FlatMove;
	moves: FlatMove[];
	cursor: number;
	onSelect: (index: number) => void;
	gameAnalysisId: string;
};

const NEEDS_BEST_MOVE: ReadonlySet<MoveClassification> = new Set([
	"good",
	"inaccuracy",
	"mistake",
	"blunder",
	"miss",
]);

const BAD_CLASSIFICATIONS: ReadonlySet<MoveClassification> = new Set([
	"mistake",
	"blunder",
]);

export function UnifiedAnalysisCard({
	move,
	moves,
	cursor,
	onSelect,
	gameAnalysisId,
}: UnifiedAnalysisCardProps) {
	const { query } = useMoveExplanation(gameAnalysisId, move.ply);
	const explanation = query.data?.explanation ?? null;
	const concepts = query.data?.tags?.concepts ?? [];

	const flagged =
		move.is_player_move && BAD_CLASSIFICATIONS.has(move.classification);

	return (
		<div
			className={`flex h-190 flex-col overflow-hidden rounded-lg border bg-surface ${
				flagged ? "border-border-strong" : "border-divider"
			}`}
		>
			<AnalysisSection
				move={move}
				flagged={flagged}
				explanationText={explanation?.explanation ?? null}
				concepts={concepts}
			/>
			<MovesPanel moves={moves} cursor={cursor} onSelect={onSelect} />
		</div>
	);
}

type AnalysisSectionProps = {
	move: FlatMove;
	flagged: boolean;
	explanationText: string | null;
	concepts: string[];
};

function AnalysisSection({
	move,
	flagged,
	explanationText,
	concepts,
}: AnalysisSectionProps) {
	const isPlayer = move.is_player_move;
	const showBestMove =
		isPlayer &&
		NEEDS_BEST_MOVE.has(move.classification) &&
		move.best_move_san !== move.san;
	const conceptNames = concepts
		.map((id) => getConceptById(id)?.name ?? id)
		.filter(Boolean);

	const hasBody = !!explanationText || showBestMove || conceptNames.length > 0;

	return (
		<div className="flex shrink-0 flex-col border-b border-divider">
			<AnalysisHeader move={move} flagged={flagged} />
			{hasBody && (
				<div className="px-5 pb-4.5 pt-4">
					{explanationText && (
						<p className="text-sm-minus leading-relaxed-2 text-fg-1">
							{explanationText}
						</p>
					)}
					{showBestMove && (
						<div className={explanationText ? "mt-3.5" : ""}>
							<BestMoveStack
								bestMoveSan={move.best_move_san}
								evalAfterIfBest={move.eval_before}
								side={move.side}
								alternatives={move.alternative_moves}
							/>
						</div>
					)}
					{conceptNames.length > 0 && (
						<div className={explanationText || showBestMove ? "mt-3.5" : ""}>
							<EyebrowLabel>Tags</EyebrowLabel>
							<div className="mt-2">
								<TagLinkList tags={conceptNames} />
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

type AnalysisHeaderProps = {
	move: FlatMove;
	flagged: boolean;
};

function AnalysisHeader({ move, flagged }: AnalysisHeaderProps) {
	const showClock =
		move.time_spent_ms !== null || move.clock_remaining_ms !== null;
	return (
		<div
			className={`flex flex-col gap-1 px-5 py-3.5 ${
				flagged ? "bg-tint-blunder" : ""
			}`}
		>
			<div className="flex items-center gap-x-2.5">
				<MoveBadge cls={move.classification} size="lg" />
				<span className="mono-nums font-mono text-ui text-fg">
					{move.moveNumber}
					{move.side === "white" ? "." : "..."} {move.san}
				</span>
				<EvalDelta
					evalBefore={move.eval_before}
					evalAfter={move.eval_after}
					side={move.side}
					className="ml-auto"
				/>
			</div>
			<div className="flex flex-col items-end gap-1">
				<EvalArrow
					evalBefore={move.eval_before}
					evalAfter={move.eval_after}
					side={move.side}
				/>
				{showClock && (
					<ClockLine
						timeSpentMs={move.time_spent_ms}
						clockRemainingMs={move.clock_remaining_ms}
					/>
				)}
			</div>
		</div>
	);
}

type ClockLineProps = {
	timeSpentMs: number | null;
	clockRemainingMs: number | null;
};

function ClockLine({ timeSpentMs, clockRemainingMs }: ClockLineProps) {
	const parts: string[] = [];
	if (timeSpentMs !== null) parts.push(`${formatDuration(timeSpentMs)} spent`);
	if (clockRemainingMs !== null)
		parts.push(`${formatClock(clockRemainingMs)} left`);
	if (parts.length === 0) return null;
	return (
		<span className="mono-nums font-mono text-2xs text-fg-3">
			{parts.join(" · ")}
		</span>
	);
}

function formatDuration(ms: number): string {
	const totalSeconds = ms / 1000;
	if (totalSeconds < 10) return `${totalSeconds.toFixed(1)}s`;
	if (totalSeconds < 60) return `${Math.round(totalSeconds)}s`;
	const m = Math.floor(totalSeconds / 60);
	const s = Math.round(totalSeconds - m * 60);
	return `${m}m ${s}s`;
}

function formatClock(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const m = Math.floor(totalSeconds / 60);
	const s = totalSeconds - m * 60;
	return `${m}:${s.toString().padStart(2, "0")}`;
}

type BestMoveStackProps = {
	bestMoveSan: string;
	evalAfterIfBest: number;
	side: "white" | "black";
	alternatives: AlternativeMove[] | null;
};

function BestMoveStack({
	bestMoveSan,
	evalAfterIfBest,
	side,
	alternatives,
}: BestMoveStackProps) {
	const closeAlternatives = (alternatives ?? []).filter(
		(alt) => Math.abs(evalAfterIfBest - alt.eval_cp) <= ALT_MOVE_THRESHOLD_CP,
	);

	return (
		<div>
			<EyebrowLabel>
				{closeAlternatives.length > 0 ? "Best moves" : "Best move"}
			</EyebrowLabel>
			<div className="mt-2 flex flex-col gap-1.5">
				<BestMoveRow
					san={bestMoveSan}
					evalCp={evalAfterIfBest}
					side={side}
					primary
				/>
				{closeAlternatives.map((alt) => (
					<BestMoveRow
						key={alt.move_uci}
						san={alt.move_san}
						evalCp={alt.eval_cp}
						side={side}
						primary={false}
					/>
				))}
			</div>
		</div>
	);
}

type BestMoveRowProps = {
	san: string;
	description?: string | null;
	tags?: string[];
	evalCp: number;
	side: "white" | "black";
	primary: boolean;
};

function BestMoveRow({
	san,
	description,
	tags,
	evalCp,
	side,
	primary,
}: BestMoveRowProps) {
	const evalDisplay = formatPlayerEvalSigned(playerPerspective(evalCp, side));
	const containerClass = primary
		? "border-data-6/30 bg-tint-data-6"
		: "border-divider bg-surface-2";
	const sanColor = primary ? "text-data-6" : "text-fg-1";
	return (
		<div
			className={`grid items-start gap-x-3 gap-y-1 rounded-sm border px-3 py-2 ${containerClass}`}
			style={{ gridTemplateColumns: "auto 1fr auto" }}
		>
			<span
				className={`mono-nums font-mono text-xs font-semibold ${sanColor}`}
				style={{ minWidth: "3.25rem", paddingTop: "1px" }}
			>
				{san}
			</span>
			<span className="text-xs-plus leading-relaxed-2 text-fg-2">
				{description ?? ""}
			</span>
			<span
				className="mono-nums font-mono text-xs-minus text-fg-3"
				style={{ paddingTop: "1px" }}
			>
				{evalDisplay}
			</span>
			{tags && tags.length > 0 && (
				<div className="col-start-2 mt-0.5">
					<TagLinkList tags={tags} size="sm" />
				</div>
			)}
		</div>
	);
}

function EyebrowLabel({ children }: { children: React.ReactNode }) {
	return (
		<div className="text-2xs font-medium uppercase tracking-label-wide text-fg-3">
			{children}
		</div>
	);
}

type MovesPanelProps = {
	moves: FlatMove[];
	cursor: number;
	onSelect: (index: number) => void;
};

type Pair = {
	moveNumber: number;
	white: FlatMove | null;
	black: FlatMove | null;
};

function groupIntoPairs(moves: FlatMove[]): Pair[] {
	const pairs = new Map<number, Pair>();
	for (const m of moves) {
		const existing = pairs.get(m.moveNumber) ?? {
			moveNumber: m.moveNumber,
			white: null,
			black: null,
		};
		if (m.side === "white") existing.white = m;
		else existing.black = m;
		pairs.set(m.moveNumber, existing);
	}
	return [...pairs.values()].sort((a, b) => a.moveNumber - b.moveNumber);
}

function MovesPanel({ moves, cursor, onSelect }: MovesPanelProps) {
	const pairs = groupIntoPairs(moves);

	return (
		<div className="min-h-70 flex-1 overflow-y-auto p-1.5">
			<table className="w-full">
				<tbody>
					{pairs.map((p) => (
						<tr key={p.moveNumber}>
							<td className="w-8.5 py-0.5 pl-2 pr-2 mono-nums font-mono text-xs-minus text-fg-4">
								{p.moveNumber}.
							</td>
							<td className="w-1/2 py-0.5 pr-1">
								<MoveCell
									move={p.white}
									active={p.white?.index === cursor}
									onClick={() => p.white && onSelect(p.white.index)}
								/>
							</td>
							<td className="w-1/2 py-0.5">
								<MoveCell
									move={p.black}
									active={p.black?.index === cursor}
									onClick={() => p.black && onSelect(p.black.index)}
								/>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

// ── Eval display helpers ────────────────────────────────────────────────

function playerPerspective(evalCp: number, side: "white" | "black"): number {
	return side === "white" ? evalCp : -evalCp;
}

function formatPlayerEvalSigned(playerEvalCp: number): string {
	const abs = Math.abs(playerEvalCp);
	if (isMateScore(abs)) {
		const mateStr = formatEval(abs);
		return playerEvalCp >= 0 ? `+${mateStr}` : `−${mateStr}`;
	}
	const pawns = playerEvalCp / 100;
	const sign = pawns >= 0 ? "+" : "−";
	return `${sign}${Math.abs(pawns).toFixed(1)}`;
}

type EvalProps = {
	evalBefore: number;
	evalAfter: number;
	side: "white" | "black";
	className?: string;
};

function EvalArrow({ evalBefore, evalAfter, side }: EvalProps) {
	const before = playerPerspective(evalBefore, side);
	const after = playerPerspective(evalAfter, side);
	const isBad = after < before;
	return (
		<span className="inline-flex items-center gap-1.5 mono-nums font-mono text-xs-minus text-fg-3">
			<span>{formatPlayerEvalSigned(before)}</span>
			<span className="text-fg-4">→</span>
			<span className={isBad ? "text-blunder" : "text-fg-2"}>
				{formatPlayerEvalSigned(after)}
			</span>
		</span>
	);
}

function EvalDelta({ evalBefore, evalAfter, side, className }: EvalProps) {
	const before = playerPerspective(evalBefore, side);
	const after = playerPerspective(evalAfter, side);

	// Suppress the delta badge whenever either side is a mate score — the
	// centipawn arithmetic is meaningless across the mate/regular boundary.
	if (isMateScore(Math.abs(before)) || isMateScore(Math.abs(after)))
		return null;

	const delta = after - before;
	const isUp = delta >= 0;
	const absDeltaCp = Math.abs(delta);

	let label: string;
	{
		const pawns = absDeltaCp / 100;
		if (pawns.toFixed(1) === "0.0") return null;
		label = pawns.toFixed(1);
	}

	return (
		<span
			className={`inline-flex items-center gap-0.5 rounded-xs px-1.5 py-0.5 ${
				isUp ? "bg-surface-2 text-fg-2" : "bg-tint-blunder text-blunder"
			} ${className ?? ""}`}
		>
			{isUp ? (
				<ArrowUp className="h-2.5 w-2.5" />
			) : (
				<ArrowDown className="h-2.5 w-2.5" />
			)}
			<span className="mono-nums font-mono text-2xs font-medium">{label}</span>
		</span>
	);
}

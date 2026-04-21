import { ArrowRight, Sparkles } from "lucide-react";
import { MoveBadge } from "#/components/ui/move-badge";
import { Tag } from "#/components/ui/tag";
import { getConceptById } from "#/config/concepts";
import { useMoveExplanation } from "#/features/explanations/hooks/use-move-explanation";
import type { FlatMove } from "#/features/game/types";

type ExplanationCardProps = {
	move: FlatMove;
	gameAnalysisId: string;
};

function shouldOfferExplanation(cls: FlatMove["classification"]) {
	return cls === "inaccuracy" || cls === "mistake" || cls === "blunder";
}

export function ExplanationCard({
	move,
	gameAnalysisId,
}: ExplanationCardProps) {
	const { query, generate } = useMoveExplanation(gameAnalysisId, move.ply);
	const explanation = query.data?.explanation ?? null;
	const tags = query.data?.tags ?? null;
	const offerExplain =
		move.is_player_move && shouldOfferExplanation(move.classification);
	const hasExplanation = !!explanation;

	const badMove =
		move.classification === "mistake" || move.classification === "blunder";

	return (
		<div
			className={`overflow-hidden rounded-[10px] border bg-surface ${
				badMove ? "border-border-strong" : "border-divider"
			}`}
		>
			<div
				className={`flex flex-wrap items-center gap-[10px] border-b border-divider px-5 py-[14px] ${
					badMove ? "bg-tint-blunder" : ""
				}`}
			>
				<MoveBadge cls={move.classification} size="lg" />
				<span className="mono-nums font-mono text-[13px] text-fg">
					{move.moveNumber}
					{move.side === "white" ? "." : "..."} {move.san}
				</span>
				<div className="ml-auto">
					<EvalChangePill
						from={move.eval_before / 100}
						to={move.eval_after / 100}
					/>
				</div>
			</div>

			<div className="px-5 py-[18px]">
				{hasExplanation ? (
					<ExplanationBody
						explanation={explanation.explanation}
						principle={explanation.principle}
						bestMoveSan={move.best_move_san}
						showBest={offerExplain}
						concepts={tags?.concepts ?? []}
					/>
				) : offerExplain ? (
					<ExplainPrompt
						onClick={() => generate.mutate()}
						loading={generate.isPending}
						error={generate.error ? String(generate.error.message) : null}
					/>
				) : (
					<p className="text-[13.5px] leading-[1.55] text-fg-2">
						{move.is_player_move
							? "This matches engine top choices. Use ← → to walk the game."
							: "Opponent's move. Use ← → to continue."}
					</p>
				)}
			</div>
		</div>
	);
}

function ExplanationBody({
	explanation,
	principle,
	bestMoveSan,
	showBest,
	concepts,
}: {
	explanation: string;
	principle: string | null;
	bestMoveSan: string;
	showBest: boolean;
	concepts: string[];
}) {
	return (
		<>
			<div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-fg-3">
				Analysis
			</div>
			<p className="mb-4 text-[14px] leading-[1.6] text-fg-1">{explanation}</p>

			{principle && (
				<div className="mb-4 rounded-[6px] border border-divider bg-surface-2 px-3 py-2 text-[12.5px] text-fg-2">
					<span className="font-medium text-fg-1">Principle:</span> {principle}
				</div>
			)}

			{showBest && (
				<div className="mb-4">
					<div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-fg-3">
						Best move
					</div>
					<div className="flex items-center gap-[10px] rounded-[6px] border border-data-6/30 bg-tint-data-6 px-3 py-[10px]">
						<span className="text-[10px] font-medium uppercase tracking-[0.06em] text-data-6">
							Top engine
						</span>
						<span className="mono-nums font-mono text-[13.5px] font-medium text-fg">
							{bestMoveSan}
						</span>
					</div>
				</div>
			)}

			{concepts.length > 0 && <ConceptTags concepts={concepts} />}
		</>
	);
}

function ConceptTags({ concepts }: { concepts: string[] }) {
	return (
		<div>
			<div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-fg-3">
				Concepts
			</div>
			<div className="flex flex-wrap gap-[6px]">
				{concepts.map((id) => {
					const concept = getConceptById(id);
					return <Tag key={id}>{concept?.name ?? id}</Tag>;
				})}
			</div>
		</div>
	);
}

function ExplainPrompt({
	onClick,
	loading,
	error,
}: {
	onClick: () => void;
	loading: boolean;
	error: string | null;
}) {
	return (
		<div>
			<p className="mb-3 text-[13.5px] leading-[1.55] text-fg-2">
				Get a plain-language explanation for this move, covering what went wrong
				and the principles it touches.
			</p>
			<button
				type="button"
				onClick={onClick}
				disabled={loading}
				className="inline-flex cursor-pointer items-center gap-2 rounded-[6px] border border-divider bg-surface-2 px-3 py-[8px] text-[13px] font-medium text-fg-1 transition-colors duration-[100ms] hover:bg-surface-3 disabled:cursor-wait disabled:opacity-70"
			>
				<Sparkles className="h-[13px] w-[13px]" />
				{loading ? "Thinking…" : "Explain this move"}
			</button>
			{error && <p className="mt-2 text-[12px] text-blunder">{error}</p>}
		</div>
	);
}

function EvalChangePill({ from, to }: { from: number; to: number }) {
	const delta = to - from;
	const big = Math.abs(delta) > 0.3;
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-[4px] px-[6px] py-[2px] ${
				big ? "bg-tint-blunder text-blunder" : "bg-surface-2 text-fg-2"
			}`}
		>
			<span className="mono-nums font-mono text-[11px]">
				{from > 0 ? "+" : ""}
				{from.toFixed(1)}
			</span>
			<ArrowRight className="h-[10px] w-[10px]" />
			<span className="mono-nums font-mono text-[11px] font-medium">
				{to > 0 ? "+" : ""}
				{to.toFixed(1)}
			</span>
		</span>
	);
}

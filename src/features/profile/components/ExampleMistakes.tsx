import { Link } from "@tanstack/react-router";
import { Badge } from "#/components/ui/badge";
import { getClassificationStyle } from "#/features/analysis/utils";
import type { DimensionDrilldownData } from "#/features/profile/types";

type ExampleMistakesProps = {
	username: string;
	dimensionLabel: string;
	examples: DimensionDrilldownData["examples"];
};

export function ExampleMistakes({
	username,
	dimensionLabel,
	examples,
}: ExampleMistakesProps) {
	return (
		<div className="rounded-lg border border-border bg-card p-5">
			<h2 className="text-[15px] font-medium">Example mistakes</h2>
			<p className="mb-3 text-[13px] text-muted-foreground">
				Recent {dimensionLabel.toLowerCase()} errors to review
			</p>

			{examples.length === 0 ? (
				<p className="text-[13px] text-muted-foreground">
					No mistakes found yet in this dimension.
				</p>
			) : (
				<div>
					{examples.map((example) => {
						const style = getClassificationStyle(
							example.classification as Parameters<
								typeof getClassificationStyle
							>[0],
						);
						return (
							<div
								key={`${example.gameId}-${example.ply}`}
								className="border-b border-border/50 py-3 last:border-0"
							>
								<div className="flex items-center justify-between gap-3">
									<p className="text-sm">
										vs {example.opponentUsername}, move {example.ply}
									</p>
									<div className="flex items-center gap-2">
										<Badge
											variant="outline"
											className={`border-none px-1.5 py-0.5 text-[11px] font-medium ${style.bg} ${style.text}`}
										>
											{style.label}
										</Badge>
										<span className="text-sm font-medium">
											{Math.round(example.evalDelta / 10) / 10} cp
										</span>
									</div>
								</div>

								<div className="mt-2 flex flex-wrap gap-1.5">
									{example.concepts.map((concept) => (
										<span
											key={`concept-${example.gameId}-${example.ply}-${concept}`}
											className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
										>
											{concept}
										</span>
									))}
									{example.pieces.map((piece) => (
										<span
											key={`piece-${example.gameId}-${example.ply}-${piece}`}
											className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
										>
											{piece}
										</span>
									))}
								</div>

								<Link
									to="/$username/games/$gameId"
									params={{ username, gameId: example.gameId }}
									search={{ ply: example.ply }}
									className="mt-2 inline-block text-xs text-primary hover:underline"
								>
									View in game &rarr;
								</Link>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

import { Link } from "@tanstack/react-router";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import type { StudyRecommendation, Weakness } from "#/db/schema";

type Props = {
	username: string;
	weaknesses: Weakness[];
	recommendations: StudyRecommendation[];
};

export function WeaknessPanel({
	username,
	weaknesses,
	recommendations,
}: Props) {
	return (
		<Card className="gap-0 py-0">
			<CardHeader className="pb-0 pt-5">
				<CardTitle className="text-[15px] font-medium">
					Weaknesses & Recommendations
				</CardTitle>
			</CardHeader>
			<CardContent className="pb-5 pt-3">
				{weaknesses.length === 0 ? (
					<p className="text-xs text-muted-foreground">
						No significant weaknesses detected. Keep playing and analyzing to
						get more detailed insights.
					</p>
				) : (
					weaknesses.map((w, i) => (
						<WeaknessItem
							key={w.key}
							username={username}
							weakness={w}
							index={i + 1}
							recommendation={recommendations.find((r) => r.weakness === w.key)}
						/>
					))
				)}
			</CardContent>
		</Card>
	);
}

const DIMENSION_LABELS: Record<string, string> = {
	phase: "Phase",
	piece: "Piece",
	concept: "Concept",
};

function WeaknessItem({
	username,
	weakness,
	index,
	recommendation,
}: {
	username: string;
	weakness: Weakness;
	index: number;
	recommendation?: StudyRecommendation;
}) {
	return (
		<div className="border-b border-border py-3 last:border-0">
			<p className="mb-1 text-sm font-medium">
				{index}. {weakness.label}
			</p>
			<p className="mb-2 text-xs leading-relaxed text-muted-foreground">
				{weakness.description}
			</p>
			<div className="flex flex-wrap gap-1.5">
				<Badge variant="secondary" className="text-xs">
					{DIMENSION_LABELS[weakness.dimension] ?? weakness.dimension}
				</Badge>
				<Badge variant="outline" className="text-xs">
					{weakness.key}
				</Badge>
			</div>
			{recommendation && (
				<p className="mt-2 text-xs text-primary">
					&rarr; {recommendation.description}
				</p>
			)}
			{weakness.examples.length > 0 && (
				<Link
					to="/$username/games/$gameId"
					params={{
						username,
						gameId: weakness.examples[0].gameId,
					}}
					className="mt-2 inline-block text-xs text-primary hover:underline"
				>
					View {weakness.examples.length}{" "}
					{weakness.examples.length === 1 ? "example" : "examples"} from your
					games
				</Link>
			)}
		</div>
	);
}

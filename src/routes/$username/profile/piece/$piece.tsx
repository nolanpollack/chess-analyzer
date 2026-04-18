import { createFileRoute } from "@tanstack/react-router";
import { DimensionDrilldown } from "#/features/profile/components/DimensionDrilldown";

export const Route = createFileRoute("/$username/profile/piece/$piece")({
	validateSearch: (search: Record<string, unknown>) => ({
		concept: typeof search.concept === "string" ? search.concept : undefined,
	}),
	component: PieceDrilldownPage,
});

function PieceDrilldownPage() {
	const { username, piece } = Route.useParams();
	const { concept } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<DimensionDrilldown
			username={username}
			dimension="piece"
			value={piece}
			selectedConcept={concept ?? null}
			onConceptChange={(nextConcept) =>
				navigate({
					to: "/$username/profile/piece/$piece",
					params: { username, piece },
					search: { concept: nextConcept ?? undefined },
					replace: true,
				})
			}
		/>
	);
}

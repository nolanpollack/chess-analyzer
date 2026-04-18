import { createFileRoute } from "@tanstack/react-router";
import { DimensionDrilldown } from "#/features/profile/components/DimensionDrilldown";

export const Route = createFileRoute("/$username/profile/opening/$eco")({
	validateSearch: (search: Record<string, unknown>) => ({
		concept: typeof search.concept === "string" ? search.concept : undefined,
	}),
	component: OpeningDrilldownPage,
});

function OpeningDrilldownPage() {
	const { username, eco } = Route.useParams();
	const { concept } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<DimensionDrilldown
			username={username}
			dimension="opening"
			value={eco}
			selectedConcept={concept ?? null}
			onConceptChange={(nextConcept) =>
				navigate({
					to: "/$username/profile/opening/$eco",
					params: { username, eco },
					search: { concept: nextConcept ?? undefined },
					replace: true,
				})
			}
		/>
	);
}

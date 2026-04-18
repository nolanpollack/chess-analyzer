import { createFileRoute } from "@tanstack/react-router";
import { DimensionDrilldown } from "#/features/profile/components/DimensionDrilldown";

export const Route = createFileRoute("/$username/profile/phase/$phase")({
	validateSearch: (search: Record<string, unknown>) => ({
		concept: typeof search.concept === "string" ? search.concept : undefined,
	}),
	component: PhaseDrilldownPage,
});

function PhaseDrilldownPage() {
	const { username, phase } = Route.useParams();
	const { concept } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<DimensionDrilldown
			username={username}
			dimension="phase"
			value={phase}
			selectedConcept={concept ?? null}
			onConceptChange={(nextConcept) =>
				navigate({
					to: "/$username/profile/phase/$phase",
					params: { username, phase },
					search: { concept: nextConcept ?? undefined },
					replace: true,
				})
			}
		/>
	);
}

import { createFileRoute } from "@tanstack/react-router";
import { DimensionDrilldown } from "#/features/profile/components/DimensionDrilldown";

export const Route = createFileRoute("/$username/profile/category/$category")({
	validateSearch: (search: Record<string, unknown>) => ({
		concept: typeof search.concept === "string" ? search.concept : undefined,
	}),
	component: CategoryDrilldownPage,
});

function CategoryDrilldownPage() {
	const { username, category } = Route.useParams();
	const { concept } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<DimensionDrilldown
			username={username}
			dimension="category"
			value={category}
			selectedConcept={concept ?? null}
			onConceptChange={(nextConcept) =>
				navigate({
					to: "/$username/profile/category/$category",
					params: { username, category },
					search: { concept: nextConcept ?? undefined },
					replace: true,
				})
			}
		/>
	);
}

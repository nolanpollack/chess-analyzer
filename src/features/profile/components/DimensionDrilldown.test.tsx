import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DimensionDrilldown } from "#/features/profile/components/DimensionDrilldown";

vi.mock("@tanstack/react-router", async () => {
	const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
		"@tanstack/react-router",
	);

	return {
		...actual,
		Link: ({
			to,
			params,
			search,
			children,
			className,
		}: {
			to: string;
			params?: Record<string, string>;
			search?: Record<string, string | number | undefined>;
			children: React.ReactNode;
			className?: string;
		}) => {
			let href = to;
			if (params) {
				for (const [key, value] of Object.entries(params)) {
					href = href.replace(`$${key}`, value);
				}
			}
			if (search && Object.keys(search).length > 0) {
				const query = new URLSearchParams();
				for (const [key, value] of Object.entries(search)) {
					if (value === undefined) continue;
					query.set(key, String(value));
				}
				href += `?${query.toString()}`;
			}

			return (
				<a href={href} className={className}>
					{children}
				</a>
			);
		},
	};
});

vi.mock("#/features/profile/hooks/use-dimension-drilldown", () => ({
	useDimensionDrilldown: vi.fn(() => ({
		isLoading: false,
		data: {
			drilldown: {
				primary: {
					label: "Middlegame",
					accuracy: 54,
					avgCpLoss: 67,
					moveCount: 340,
					gameCount: 89,
					overallAccuracy: 61,
					isWeakest: true,
					weakestLabel: "Weakest phase",
				},
				trend: {
					recentAccuracy: 57,
					olderAccuracy: 52,
					direction: "improving",
				},
				byPiece: [{ piece: "knight", accuracy: 48, moveCount: 120 }],
				byConcept: [
					{ concept: "piece-coordination", missCount: 12, totalCount: 30 },
				],
				byOpening: [
					{
						eco: "B20",
						name: "Sicilian Defense",
						accuracy: 48,
						gameCount: 18,
					},
				],
				examples: [
					{
						gameId: "11111111-1111-4111-8111-111111111111",
						opponentUsername: "opponent42",
						ply: 24,
						moveSan: "Nf3",
						classification: "mistake",
						evalDelta: -145,
						concepts: ["piece-coordination"],
						pieces: ["knight"],
					},
				],
				conceptSampleSize: 42,
			},
		},
	})),
}));

describe("DimensionDrilldown", () => {
	it("renders header, metrics, cards, and examples", () => {
		const queryClient = new QueryClient();

		render(
			<QueryClientProvider client={queryClient}>
				<DimensionDrilldown
					username="demo"
					dimension="phase"
					value="middlegame"
				/>
			</QueryClientProvider>,
		);

		expect(screen.getByText("Middlegame")).toBeInTheDocument();
		expect(screen.getByText("Accuracy")).toBeInTheDocument();
		expect(screen.getByText("By piece")).toBeInTheDocument();
		expect(screen.getByText("Example mistakes")).toBeInTheDocument();
	});
});

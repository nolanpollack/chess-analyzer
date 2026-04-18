import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SubBreakdownCard } from "#/features/profile/components/SubBreakdownCard";

describe("SubBreakdownCard", () => {
	it("renders accuracy rows with values", () => {
		render(
			<SubBreakdownCard
				title="By piece"
				overallAccuracy={60}
				rows={[
					{
						key: "knight",
						label: "Knight",
						accuracy: 48,
						supportingText: "22 moves",
					},
				]}
			/>,
		);

		expect(screen.getByText("By piece")).toBeInTheDocument();
		expect(screen.getByText("Knight")).toBeInTheDocument();
		expect(screen.getByText("48%")).toBeInTheDocument();
	});

	it("renders concept miss rows", () => {
		render(
			<SubBreakdownCard
				title="By concept"
				overallAccuracy={60}
				isConcept
				rows={[
					{
						key: "piece-coordination",
						label: "Piece coordination",
						missCount: 12,
						totalCount: 30,
					},
				]}
			/>,
		);

		expect(screen.getByText("Piece coordination")).toBeInTheDocument();
		expect(screen.getByText("12 misses")).toBeInTheDocument();
	});
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExampleMistakes } from "#/features/profile/components/ExampleMistakes";

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
			const username = params?.username ?? "";
			const gameId = params?.gameId ?? "";
			const ply = search?.ply;
			const href = `${to
				.replace("$username", username)
				.replace(
					"$gameId",
					gameId,
				)}${typeof ply === "number" ? `?ply=${ply}` : ""}`;
			return (
				<a href={href} className={className}>
					{children}
				</a>
			);
		},
	};
});

describe("ExampleMistakes", () => {
	it("renders mistake rows and links with ply query", () => {
		const queryClient = new QueryClient();

		render(
			<QueryClientProvider client={queryClient}>
				<ExampleMistakes
					username="demo"
					dimensionLabel="Middlegame"
					examples={[
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
					]}
				/>
			</QueryClientProvider>,
		);

		expect(screen.getByText(/vs opponent42, move 24/i)).toBeInTheDocument();
		const link = screen.getByRole("link", { name: /view in game/i });
		expect(link).toHaveAttribute(
			"href",
			"/demo/games/11111111-1111-4111-8111-111111111111?ply=24",
		);
	});
});

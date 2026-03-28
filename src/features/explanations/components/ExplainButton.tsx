/**
 * Button to trigger move explanation generation.
 * Adapts text and styling based on move classification.
 */
import { Loader2 } from "lucide-react";
import { Button } from "#/components/ui/button";
import type { MoveClassification } from "#/db/schema";

type ExplainButtonProps = {
	classification: MoveClassification;
	isLoading: boolean;
	onClick: () => void;
};

function getButtonConfig(classification: MoveClassification): {
	text: string;
	variant: "default" | "outline" | "ghost";
} {
	switch (classification) {
		case "blunder":
		case "mistake":
			return { text: "Explain this move", variant: "default" };
		case "inaccuracy":
			return { text: "Explain this move", variant: "outline" };
		case "good":
			return { text: "Explain this move", variant: "outline" };
		case "best":
		case "brilliant":
			return { text: "Why is this good?", variant: "outline" };
	}
}

export function ExplainButton({
	classification,
	isLoading,
	onClick,
}: ExplainButtonProps) {
	const config = getButtonConfig(classification);

	return (
		<Button
			variant={config.variant}
			size="sm"
			onClick={onClick}
			disabled={isLoading}
			className="text-sm"
		>
			{isLoading ? (
				<>
					<Loader2 className="size-4 animate-spin" />
					Thinking...
				</>
			) : (
				config.text
			)}
		</Button>
	);
}

import { Badge } from "#/components/ui/badge";

export function AnalysisStatusBadge({
	status,
}: {
	status: "pending" | "complete" | "failed" | null;
}) {
	if (!status) {
		return <span className="text-xs text-muted-foreground">—</span>;
	}

	const config = {
		pending: { label: "Pending", variant: "secondary" as const },
		complete: { label: "Analyzed", variant: "default" as const },
		failed: { label: "Failed", variant: "destructive" as const },
	} as const;

	const { label, variant } = config[status];

	return <Badge variant={variant}>{label}</Badge>;
}

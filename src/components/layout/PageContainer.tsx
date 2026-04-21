import type { ReactNode } from "react";
import { cn } from "#/lib/utils";

type PageContainerProps = {
	className?: string;
	children: ReactNode;
};

export function PageContainer({ className, children }: PageContainerProps) {
	return (
		<div className={cn("mx-auto max-w-7xl px-10 pb-20 pt-10", className)}>
			{children}
		</div>
	);
}

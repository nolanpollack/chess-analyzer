import type { ReactNode } from "react";

type TagProps = {
	children: ReactNode;
	className?: string;
};

export function Tag({ children, className = "" }: TagProps) {
	return (
		<span
			className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-medium text-fg-2 ${className}`}
			style={{
				background: "var(--surface-2)",
				borderColor: "var(--divider-token)",
			}}
		>
			{children}
		</span>
	);
}

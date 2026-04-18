import type { ReactNode } from "react";

type TagProps = {
	children: ReactNode;
	className?: string;
};

export function Tag({ children, className = "" }: TagProps) {
	return (
		<span
			className={`inline-flex items-center rounded-full border px-[7px] py-[2px] text-[11px] font-medium text-fg-2 ${className}`}
			style={{
				background: "var(--surface-2)",
				borderColor: "var(--divider-token)",
			}}
		>
			{children}
		</span>
	);
}

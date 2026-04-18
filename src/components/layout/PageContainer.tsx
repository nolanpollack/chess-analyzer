import type { ReactNode } from "react";

type PageContainerProps = {
	children: ReactNode;
};

export function PageContainer({ children }: PageContainerProps) {
	return (
		<div className="mx-auto max-w-[1280px] px-10 pb-20 pt-10">{children}</div>
	);
}

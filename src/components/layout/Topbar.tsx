import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

type Crumb = {
	label: string;
	/**
	 * Optional TanStack-router link props. When set, the crumb renders as a
	 * Link and navigates on click. Mutually exclusive with `onClick`.
	 */
	to?: LinkProps;
	onClick?: () => void;
};

type TopbarProps = {
	crumbs: Crumb[];
	actions?: ReactNode;
};

export function Topbar({ crumbs, actions }: TopbarProps) {
	return (
		<div className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-4 border-b border-divider bg-topbar-bg px-10 backdrop-blur-md">
			<nav className="flex items-center gap-2 text-ui text-fg-2">
				{crumbs.map((crumb, i) => (
					<span key={crumb.label} className="flex items-center gap-2">
						{i > 0 && <span className="text-fg-4">/</span>}
						<CrumbItem crumb={crumb} isLast={i === crumbs.length - 1} />
					</span>
				))}
			</nav>
			{actions && (
				<div className="ml-auto flex items-center gap-2">{actions}</div>
			)}
		</div>
	);
}

function CrumbItem({ crumb, isLast }: { crumb: Crumb; isLast: boolean }) {
	const baseLink = "cursor-pointer transition-colors hover:text-fg";
	const lastClass = isLast ? "font-medium text-fg" : "";

	if (crumb.to) {
		return (
			<Link
				{...(crumb.to as LinkProps)}
				className={`${baseLink} ${lastClass}`.trim()}
			>
				{crumb.label}
			</Link>
		);
	}
	if (crumb.onClick) {
		return (
			<button
				type="button"
				className={`${baseLink} ${lastClass}`.trim()}
				onClick={crumb.onClick}
			>
				{crumb.label}
			</button>
		);
	}
	return <span className={lastClass}>{crumb.label}</span>;
}

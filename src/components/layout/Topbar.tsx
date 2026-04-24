import type { ReactNode } from "react";

type Crumb = {
	label: string;
	onClick?: () => void;
};

type TopbarProps = {
	crumbs: Crumb[];
	actions?: ReactNode;
};

export function Topbar({ crumbs, actions }: TopbarProps) {
	return (
		<div className="sticky top-0 z-10 flex items-center gap-4 border-b border-divider bg-topbar-bg px-10 py-3.5 backdrop-blur-[12px]">
			<nav className="flex items-center gap-2 text-ui text-fg-2">
				{crumbs.map((crumb, i) => (
					<span key={crumb.label} className="flex items-center gap-2">
						{i > 0 && <span className="text-fg-4">/</span>}
						{crumb.onClick ? (
							<button
								type="button"
								className="cursor-pointer hover:text-fg"
								onClick={crumb.onClick}
							>
								{crumb.label}
							</button>
						) : (
							<span
								className={i === crumbs.length - 1 ? "font-medium text-fg" : ""}
							>
								{crumb.label}
							</span>
						)}
					</span>
				))}
			</nav>
			{actions && (
				<div className="ml-auto flex items-center gap-2">{actions}</div>
			)}
		</div>
	);
}

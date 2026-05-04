import { Fragment, type ReactNode } from "react";

type TagLinkProps = {
	children: ReactNode;
	size?: "sm" | "md";
	onClick?: () => void;
};

const SIZE_CLASS: Record<NonNullable<TagLinkProps["size"]>, string> = {
	sm: "text-2xs",
	md: "text-xs-plus",
};

export function TagLink({ children, size = "md", onClick }: TagLinkProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`cursor-pointer text-fg-2 underline decoration-border-token decoration-1 underline-offset-2 transition-colors duration-100 hover:text-accent-brand hover:decoration-accent-brand ${SIZE_CLASS[size]}`}
		>
			{children}
		</button>
	);
}

type TagLinkListProps = {
	tags: string[];
	size?: "sm" | "md";
	onTagClick?: (tag: string) => void;
};

export function TagLinkList({
	tags,
	size = "md",
	onTagClick,
}: TagLinkListProps) {
	const dotSize = size === "sm" ? "text-2xs" : "text-xs-plus";
	return (
		<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
			{tags.map((tag, i) => (
				<Fragment key={tag}>
					{i > 0 && <span className={`text-fg-4 ${dotSize}`}>·</span>}
					<TagLink
						size={size}
						onClick={onTagClick ? () => onTagClick(tag) : undefined}
					>
						{tag}
					</TagLink>
				</Fragment>
			))}
		</div>
	);
}

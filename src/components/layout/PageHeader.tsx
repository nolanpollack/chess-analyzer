type PageHeaderProps = {
	title: string;
	subtitle?: string;
};

export function PageHeader({ title, subtitle }: PageHeaderProps) {
	return (
		<div className="mb-9">
			<h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-fg">
				{title}
			</h1>
			{subtitle && (
				<p className="mt-[6px] max-w-[560px] text-sm leading-[1.5] text-fg-2">
					{subtitle}
				</p>
			)}
		</div>
	);
}

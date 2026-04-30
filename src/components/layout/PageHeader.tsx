type PageHeaderProps = {
	title: string;
	subtitle?: string;
};

export function PageHeader({ title, subtitle }: PageHeaderProps) {
	return (
		<div className="mb-9">
			<h1 className="text-page-title font-semibold leading-tight tracking-tight-3 text-fg">
				{title}
			</h1>
			{subtitle && (
				<p className="mt-1.5 max-w-140 text-sm leading-normal text-fg-2">
					{subtitle}
				</p>
			)}
		</div>
	);
}

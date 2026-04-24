type Option<T extends string> = {
	value: T;
	label: string;
};

type SegmentedProps<T extends string> = {
	options: Option<T>[];
	value: T;
	onChange: (value: T) => void;
};

export function Segmented<T extends string>({
	options,
	value,
	onChange,
}: SegmentedProps<T>) {
	return (
		<div
			className="inline-flex gap-0.5 rounded-[6px] p-0.5"
			style={{ background: "var(--surface-2)" }}
		>
			{options.map((opt) => (
				<button
					key={opt.value}
					type="button"
					onClick={() => onChange(opt.value)}
					className={[
						"rounded-[4px] px-2.5 py-1 text-[11.5px] font-medium transition-all duration-[120ms]",
						value === opt.value
							? "bg-surface text-fg shadow-sm"
							: "text-fg-2 hover:text-fg",
					].join(" ")}
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}

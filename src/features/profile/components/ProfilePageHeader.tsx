import { PageHeader } from "#/components/layout/PageHeader";

type ProfilePageHeaderProps = {
	eloDelta: number | null;
};

export function ProfilePageHeader({ eloDelta }: ProfilePageHeaderProps) {
	const subtitle =
		eloDelta !== null && eloDelta > 0
			? `You climbed ${eloDelta} points this month — keep it up.`
			: "Your chess performance at a glance.";

	return <PageHeader title="Your chess, at a glance" subtitle={subtitle} />;
}

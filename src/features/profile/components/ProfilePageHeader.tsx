import { PageHeader } from "#/components/layout/PageHeader";
import { usePlayerSummary } from "../hooks/use-player-summary";

export function ProfilePageHeader({ username }: { username: string }) {
  const { data: summary } = usePlayerSummary(username);
  const eloDelta = summary?.eloDelta30d;

  const subtitle = getGreetingSubtitle(eloDelta);

  return <PageHeader title="Your chess, at a glance" subtitle={subtitle} />;
}

function getGreetingSubtitle(eloDelta: number | null | undefined): string {
  if (eloDelta == null) return "Your recent performance and trends.";
  if (eloDelta > 0) return `You climbed ${eloDelta} points this month — keep it up.`;
  if (eloDelta < 0) return `You're down ${Math.abs(eloDelta)} points this month — let's find the leaks.`;
  return "Steady month — time to break through?";
}

import { useParams } from "@tanstack/react-router";

/**
 * Returns the current player's username from route params.
 * Isolated here so we can swap in session/auth lookup later
 * without touching individual components.
 */
export function useCurrentPlayer(): string | undefined {
	// useParams returns an empty object when not within a $username route,
	// so we cast and check for the key.
	const params = useParams({ strict: false }) as Record<string, string>;
	return params.username ?? undefined;
}

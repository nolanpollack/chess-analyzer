# Frontend Code Quality

## File organization

Non-generic code lives in `src/features/{domain}/`. Feature-module layout,
server-code boundaries, cross-feature imports, and hook placement rules
live in `.claude/rules/feature-modules.md` — read that first. This file
covers frontend-only concerns (component size, typography, state
consolidation, types idioms).

Component files use PascalCase matching the primary export (`GameTable.tsx`
exports `GameTable`). All other files use kebab-case (`use-games.ts`,
`chess-utils.ts`). This overrides the general kebab-case rule in code-style.md
for component files only.

## Route files are thin

Route files (`src/routes/`) should only: extract route params, compose feature
components, and define the page's top-level layout. All data fetching, business
logic, and non-trivial rendering lives in feature modules.

## File size

If a file exceeds ~150 lines it likely needs to be split. A component file
should contain one exported component and at most one or two small private
helpers (<20 lines each). Extract multiple components into separate files.

A route file may define at most one small private helper (<15 lines JSX).
Anything larger belongs in the feature's `components/` directory. Route files
should target ~30-50 lines: params, hook calls, and composition only.

## Custom hooks

Every `useQuery` / `useMutation` call lives in a custom hook inside the
feature's `hooks/` directory, not inline in a component. The hook owns the
query key, query function, options, and return type.

All mutations must use `useMutation` — never manage async loading state manually
with `useState` + try/finally. This ensures consistent loading/error lifecycle.

```ts
// features/games/hooks/use-player-status.ts
export function usePlayerStatus(username: string) {
  return useQuery({
    queryKey: ["playerStatus", username],
    queryFn: () => getPlayerStatus({ data: { username } }),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && "found" in data && data.found && data.isSyncing) return 3000;
      return false;
    },
  });
}
```

Hook naming: `use{Resource}` for data (useGames), `use{Action}` for mutations
(useSyncPlayer), `use{Behavior}` for utilities (usePagination).

## Types — derive, don't duplicate

Never manually write a type that can be inferred from a server function or
schema. Manual types drift; derived types stay correct automatically.

```ts
// Bad — duplicated, will drift
type Game = { id: string; playedAt: string; resultDetail: string; … }

// Good — derived from the actual return type
type ListGamesResult = Awaited<ReturnType<typeof listGames>>
export type Game = ListGamesResult["items"][number]
```

For a server function with a discriminated return (success OR `{ error }`),
pick the success branch with `Exclude`:

```ts
type Result = Awaited<ReturnType<typeof getFoo>>
export type FooOk = Exclude<Result, { error: string }>
```

### What belongs in `features/{x}/types.ts`

- **Derived server types** — aliases like `type Game = Awaited<…>["items"][number]`.
  Put them here so consumers don't each re-derive.
- **UI-only view models** — compact projection shapes (`GameSummary`,
  `FocusArea`) that components build from server data. These are not wire
  DTOs and cannot be derived.
- **Feature-local string unions** — values not in `schema.ts` and not a
  server return field (e.g. `"W" | "L" | "D"` display letters).

### What does NOT belong

- **Duplicates of schema enums** — import from `#/db/schema` (e.g.
  `PlayerColor`, `TimeControlClass`). Schema is the single source of truth
  for pgEnum values; drifting here breaks runtime Drizzle queries silently.
- **Duplicates of another feature's type** — import from that feature. If
  two features need the same type, it belongs to the one that owns the
  producing data.
- **Internal helper types** — if only one function uses a type, inline it
  or keep it local to that file.

### Server function annotations — prefer inference

Do **not** annotate a `createServerFn().handler(...)` return if the shape
is going to be derived by consumers via `Awaited<ReturnType<…>>`. Manual
annotation + derivation is circular: if types.ts imports the fn to derive
and the fn imports types.ts to annotate, the fn becomes its own type
source. Let TS infer the handler return from the literal value; derive
from there.

### Explicit function types at feature boundaries

Exported hooks and utility functions should have an explicit return type
when the type is non-obvious or part of the feature's API. A query hook
returning `useQuery(...)`'s native type is fine to leave inferred; a hook
doing extra projection should annotate the return so the shape doesn't
drift silently.

## State consolidation

When multiple `useState` calls are related and reset together, consolidate into
one object:

```ts
// Bad
const [timeClass, setTimeClass] = useState<…>()
const [result, setResult] = useState<…>()
const [page, setPage] = useState(1)

// Good
const [filters, setFilters] = useState<GameFilters>({
  timeControlClass: undefined,
  result: undefined,
  playerColor: undefined,
  page: 1,
})
function updateFilter(update: Partial<GameFilters>) {
  setFilters((prev) => ({ ...prev, ...update, page: 1 }));
}
```

## Component responsibility

Each component does one thing. Signs it needs to be split:
- More than one `useQuery` / `useMutation`
- More than one distinct UI section (header + table + pagination)
- More than 2–3 pieces of local state
- More than ~100 lines of JSX

Prefer passing data and callbacks as props. The feature's top-level component
or hook owns the data; children receive it via props.

## Extract shared logic, don't duplicate

When the same logic appears in 2+ files, extract it to a shared location:
- UI utilities (result classification, display helpers): `src/lib/` (e.g. `getResultDisplay` in chess-utils.ts)
- Data transformations used by components: feature `utils.ts` (e.g. `groupMovesIntoPairs`, `buildEvalGraphData`)
- Shared visual components used across features: `src/components/` (e.g. `AccuracyBar`)

## Typography hierarchy

Use consistent text sizes and weights for each role:
- Page headings (`h1`): `text-2xl font-semibold tracking-tight`
- Card titles: `text-[15px] font-medium` (via shadcn CardTitle)
- Section labels: `text-sm font-medium text-muted-foreground`
- Data values: `text-sm font-medium`
- Body/muted text: `text-[13px] text-muted-foreground` or `text-xs text-muted-foreground`
- Tiny badges (weakest, etc.): `text-[11px]` via shadcn Badge with custom className

## Avoid

- Inline type definitions for data from the server — always derive
- Multiple exported components in one file
- Business logic or data fetching in route files
- Prop drilling more than 2 levels deep — restructure or use composition
- Raw `<div className="rounded-lg border bg-card">` when shadcn Card exists
- Duplicating classification/display logic — extract to shared utilities

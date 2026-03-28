# Frontend Code Quality

## File organization

Non-generic code lives in `src/features/{domain}/`. Each feature owns its
components, hooks, and types:

```
src/
├── features/
│   ├── games/
│   │   ├── components/   GameTable.tsx, GameFilters.tsx, …
│   │   ├── hooks/        use-games.ts, use-player-status.ts, …
│   │   └── types.ts
│   ├── analysis/         components/hooks for game analysis view
│   ├── explanations/     LLM move explanation UI
│   └── profile/          player profile & game performance
├── components/           shared/generic only (Header, ThemeToggle, ui/)
├── lib/                  shared utilities
└── routes/               thin composition files
```

A file belongs in `features/` if it is specific to one domain. It belongs in
`components/` or `lib/` if two or more features use it.

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
type GamesResult = Awaited<ReturnType<typeof listGames>>
export type Game = GamesResult["games"][number]
```

Feature-local derived types go in `features/{domain}/types.ts`. No global
`types.ts`.

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

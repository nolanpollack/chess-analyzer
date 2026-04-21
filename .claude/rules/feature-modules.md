# Feature Modules

All non-generic code lives inside a feature module under `src/features/{feature}/`.
A feature module is the smallest unit that owns a resource end-to-end:
components, hooks, server functions, types, and local utilities.

## When to create a feature module

Create a new module when a new resource or user-facing concern is introduced
(e.g. `games`, `players`, `explanations`, `profile`). The name should map to
the resource, not the screen. Screen-specific modules are rare — prefer
composing a screen from resource modules. If a screen has non-trivial
screen-only logic (e.g. `features/game/` for the game detail screen), that
module imports from the resource modules it composes.

## Directory layout

Every feature module may contain any subset of these subdirectories. Omit
the ones that don't apply — don't create empty folders.

```
src/features/{feature}/
├── server/          server functions (createServerFn); see §Server code
├── hooks/           custom useQuery/useMutation hooks; one export per file
├── components/      feature-specific React components (PascalCase filenames)
├── utils/           pure helpers used only within this feature
├── types.ts         shared types for this feature; see §Types
└── mocks/           fixture data for tests/stories (optional)
```

## Server code lives in the feature

Every server function that reads or writes a feature's resource lives inside
that feature's `server/` directory — not in the root `src/server/`. The root
`src/server/` is reserved for **genuinely cross-cutting** server functions
(healthcheck, auth, etc.) that don't belong to any single resource.

### queries.ts vs mutations.ts

Split server functions into two files by HTTP method / intent:

- `server/queries.ts` — `createServerFn({ method: "GET" })` reads
- `server/mutations.ts` — `createServerFn({ method: "POST" })` writes

Small internal helpers that support only one file stay with that file.
Helpers shared between queries and mutations go in a sibling file
(e.g. `server/recompute.ts`) — never cross-import between queries.ts and
mutations.ts. Never export a `createServerFn` from a shared helper file.

### Where does a server function belong?

- About one instance of a resource → that resource's feature (e.g.
  `getGamePerformance(gameAnalysisId)` lives with the `game` feature,
  not `profile`, because it describes a single game).
- Aggregates across many of a resource → the aggregate's feature
  (e.g. `getPlayerProfile(username)` lives in `profile/`).
- Touches multiple resources with no clear owner → the consuming feature
  (e.g. a report server fn consumed only by `profile/` belongs there).
- Truly cross-cutting with no feature owner → `src/server/`.

## Hook conventions

Every `useQuery` / `useMutation` lives in a custom hook inside
`features/{x}/hooks/`. One hook per file, named `use-{resource}.ts` for
reads and `use-{action}.ts` for writes. The hook owns the query key, query
fn, options, and its return type (derived, not duplicated).

Do not inline `useQuery` / `useMutation` in a component. Do not manually
manage `useState` + try/finally for async work — always `useMutation`.

## Cross-feature imports

A feature may import from other features, but only in one direction per
edge. Typical dependency order: `game`/`profile` → `games`/`players` →
`explanations`. If two features end up wanting to import from each other,
extract the shared piece to `src/components/`, `src/lib/`, or
`src/db/schema.ts` instead.

Routes (`src/routes/`) may import from any feature; features must not
import from `src/routes/`.

## Worker boundary

Worker jobs (`src/worker/`) cannot import from `src/features/{x}/server/`
(same rule as the old `src/server/`). Reason: server functions pull in the
TanStack Start runtime. If the worker needs shared logic, extract a plain
function into `src/lib/` or a feature-local file with no `createServerFn`
calls, and import that from both.

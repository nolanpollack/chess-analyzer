# Code Style

## TypeScript
- Strict mode always on (tsconfig strict: true)
- No `any` — use `unknown` and narrow, or define an explicit type
- Prefer `type` over `interface` unless declaration merging is needed
- Named exports everywhere (default exports only for route components)

## Naming
- Files: kebab-case (e.g. game-provider.ts)
- Types: PascalCase
- Functions/variables: camelCase
- DB tables: snake_case (Drizzle convention)
- Enum values: lowercase-with-hyphens (e.g. 'chess.com', 'time-control')

## Imports
- Use `#/` path alias for all src/ imports (configured in tsconfig and package.json)
- Group: external packages first, then internal #/
- Never use process.env directly — always import from #/env

## Environment variables
- All env vars defined and validated in src/env.ts using t3-env
- Never access process.env directly outside of src/env.ts
- Exception: drizzle.config.ts uses dotenv directly because drizzle-kit
  runs as a standalone CLI where t3-env validation would require all server vars
- Exception: the worker process (src/worker/) may read DATABASE_URL from
  process.env directly since it runs outside the Vite/t3-env context
- Add new env vars to env.ts, .env.local, and .env.example together
- t3-env runtimeEnv uses `process.env` (not `import.meta.env`) so the worker
  (plain Bun process) can also use the same env module

## Formatting
- Biome handles all formatting and linting (no ESLint/Prettier)
- Indent style: tabs
- Quote style: double quotes
- Run `bun run check` to verify

## Error handling
- All pg-boss job handlers: try/catch with structured console.error
- All LLM calls: try/catch, always write to llm_logs regardless of outcome
- Never swallow errors silently

## Testing
- Vitest with `passWithNoTests: true` so CI exits 0 when no tests exist
- vite.config.ts conditionally excludes server-side plugins (nitro,
  tanstackStart, devtools) when `process.env.VITEST === "true"` to
  prevent Vitest from hanging
- Test files co-located next to source: `{name}.test.ts`
- Use `vi.fn()` / `vi.spyOn()` for mocking; mock `fetch` via
  `globalThis.fetch = vi.fn()`

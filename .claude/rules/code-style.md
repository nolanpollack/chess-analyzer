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
- Add new env vars to env.ts, .env.local, and .env.example together

## Formatting
- Biome handles all formatting and linting (no ESLint/Prettier)
- Indent style: tabs
- Quote style: double quotes
- Run `bun run check` to verify

## Error handling
- All pg-boss job handlers: try/catch with structured console.error
- All LLM calls: try/catch, always write to llm_logs regardless of outcome
- Never swallow errors silently

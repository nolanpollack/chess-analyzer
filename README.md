# Chess Analyzer

A web app that fetches your chess.com games, stores them in Postgres, and displays a paginated list with metadata. Built with TanStack Start, Drizzle ORM, and shadcn/ui.

## Prerequisites

- [Bun](https://bun.sh/) runtime
- PostgreSQL 17+

## Setup

```bash
bun install
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL
```

Create the database and run migrations:

```bash
createdb chess_analyzer
bun run db:push
```

## Development

Start the dev server:

```bash
bun run dev
```

Start the background worker (syncs games from chess.com):

```bash
bun run worker
```

## Testing

```bash
bun run test
```

## Linting & Formatting

This project uses [Biome](https://biomejs.dev/) for linting and formatting:

```bash
bun run check
```

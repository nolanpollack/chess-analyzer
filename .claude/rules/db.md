# Database

## Enum policy
All fixed value sets MUST be Drizzle pgEnum — never plain text columns.
Current enums (add new ones here when introduced):
- platform: ['chess.com', 'lichess']
- time_control_class: ['bullet', 'blitz', 'rapid', 'classical', 'daily']
- game_result: ['win', 'loss', 'draw']
- player_color: ['white', 'black']
- move_classification: ['brilliant', 'best', 'good', 'inaccuracy', 'mistake', 'blunder']
- insight_severity: ['critical', 'major', 'minor']
- analysis_status: ['pending', 'complete', 'failed']

## Schema conventions
- All tables: uuid PK named `id`, `created_at` timestamp defaultNow()
- FK naming: {table_singular}_id
- Denormalize player_id onto any table queried by player to avoid
  deep join chains (e.g. move_insights has player_id directly)

## LLM output columns
Every row produced by LLM must store:
- model: text (e.g. 'claude-sonnet-4-6')
- prompt_version: text (format: '{feature}-v{n}', e.g. 'move-insight-v1')
Every LLM call must produce a row in llm_logs regardless of success/failure.

## Migrations
- Run `bun run db:generate` after every schema change
- Never edit generated migration files manually
- Commit migration files to version control

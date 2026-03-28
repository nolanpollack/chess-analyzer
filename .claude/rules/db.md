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
- game_phase: ['opening', 'middlegame', 'endgame']
- chess_piece: ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']
- concept: [29 values — see src/config/concepts.ts CONCEPT_TAXONOMY for the full list]

## Schema conventions
- All tables: uuid PK named `id`, `created_at` timestamp defaultNow()
- FK naming: {table_singular}_id
- Denormalize player_id onto any table queried by player to avoid
  deep join chains (e.g. move_insights has player_id directly)
- Result classification (win/loss/draw) is computed at the application
  layer via `classifyResult()` in `src/lib/chess-utils.ts`, NOT stored
  as a DB column. The DB stores the raw `result_detail` (e.g. "checkmated",
  "resigned", "stalemate") from the provider.
- `last_synced_at` on the players table tracks the most recent successful sync

## Key tables
- `move_tags`: deterministic metadata for each analyzed move (game_phase, pieces_involved).
  Generated during the analyze-game job after engine analysis completes.
  One row per move per game_analysis. FK to `game_analyses`, indexed by `game_analysis_id`.
- `move_explanations`: LLM-generated plain-language explanations for individual moves.
  Created on-demand when a user requests an explanation. Stores `model` and `prompt_version`.
  Concepts (from the concept taxonomy) are stored as a `concept[]` array column.
- `llm_logs`: audit trail for every LLM call (success or failure). Stores model, prompt_version,
  input_tokens, output_tokens, duration_ms, and error message on failure.

## LLM output columns
Every row produced by LLM must store:
- model: text (e.g. 'claude-sonnet-4-6')
- prompt_version: text (format: '{feature}-v{n}', e.g. 'move-insight-v1')
Every LLM call must produce a row in llm_logs regardless of success/failure.

## Migrations
- Run `bun run db:generate` after every schema change
- Never edit generated migration files manually
- Commit migration files to version control

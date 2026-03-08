# LLM Prompt Design

## Output format
All LLM calls use the Vercel AI SDK's `generateObject` with a Zod schema.
This enforces structured output without manual JSON parsing or prompt
engineering tricks. Never use `generateText` for calls that need
structured data.

```ts
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

const { object } = await generateObject({
  model: anthropic('claude-sonnet-4-6'),
  schema: z.object({ ... }),
  prompt: '...',
})
```

To switch providers, replace the model line only:
- Anthropic: `anthropic('claude-sonnet-4-6')` — requires `@ai-sdk/anthropic`
- OpenAI: `openai('gpt-4o')` — requires `@ai-sdk/openai`
Nothing else in the calling code changes.

## Prompt versioning
Format: '{feature}-v{n}' (e.g. move-insight-v1, weakness-report-v2)
Increment version when prompt changes produce meaningfully different output.
Re-run LLM jobs (not engine jobs) when improving prompts.

## Concept taxonomy
move_insights.concepts[] must contain only values from this list.
Extend this list intentionally — never allow free-form tags.

Tactical:
  hanging-piece, fork, pin, skewer, discovered-attack, back-rank,
  zwischenzug, deflection, overloaded-piece, mating-net-missed

Positional:
  open-file-control, weak-square, pawn-structure, piece-activity,
  bishop-pair, outpost, space-advantage, king-safety

Strategic:
  development-tempo, premature-attack, piece-coordination,
  rook-activation, passed-pawn, prophylaxis

Endgame:
  king-activation, opposition, pawn-promotion, rook-endgame-technique,
  zugzwang

## Required context for move insight prompts
- Player rating
- Game phase (opening / middlegame / endgame)
- FEN before the move
- Move played (SAN) and best move (SAN)
- Eval before and after in centipawns, from player's perspective
- 2 moves before and after for context

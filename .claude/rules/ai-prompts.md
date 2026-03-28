# LLM Prompt Design

## Output format
All LLM calls use the Vercel AI SDK's `generateObject` with a Zod schema.
This enforces structured output without manual JSON parsing or prompt
engineering tricks. Never use `generateText` for calls that need
structured data.

```ts
import { generateObject } from 'ai'
import { getLLMModel } from '#/config/llm'

const { object } = await generateObject({
  model: getLLMModel(),
  schema: z.object({ ... }),
  prompt: '...',
})
```

Provider is selected via env vars (`LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`).
See `src/config/llm.ts` for the factory function. Never import provider constructors
directly — always go through `getLLMModel()`.

## Prompt versioning
Format: '{feature}-v{n}' (e.g. move-insight-v1, weakness-report-v2)
Increment version when prompt changes produce meaningfully different output.
Re-run LLM jobs (not engine jobs) when improving prompts.

## Concept taxonomy
The canonical concept taxonomy lives in `src/config/concepts.ts` (CONCEPT_TAXONOMY array).
It contains 29 concepts across 4 dimensions: tactical, positional, strategic, endgame.
To add a concept: add to the `conceptEnum` in schema.ts, add to CONCEPT_TAXONOMY, generate
a migration, and increment the prompt version.

Never allow free-form tags — only values from the taxonomy.

## Move explanation prompts
- Prompt builder: `src/prompts/move-explanation.ts` (`buildMoveExplanationPrompt`)
- Prompt helpers: `src/prompts/helpers.ts` (eval formatting, move sequence formatting,
  classification descriptions)
- Rating-adaptive language: prompt adjusts jargon level based on player ELO band
- Prompt includes the full concept taxonomy so the LLM can tag relevant concepts
- Prompt version format: `move-explanation-v{n}`

## LLM integration
- LLM wrapper: `src/lib/llm.ts` (`callLLMWithLogging`) — handles `generateObject`,
  logs to `llm_logs` table on success and failure, returns typed result
- LLM config: `src/config/llm.ts` — provider selection, model ID, `getLLMModel()` factory
- Provider is selected at runtime via env vars (no code changes needed):
  - `LLM_PROVIDER` — `"anthropic"` (default) or `"openai"`
  - `LLM_MODEL` — override the default model for the provider
  - `LLM_BASE_URL` — override base URL (for local LLMs like Ollama, LM Studio)
  - The `"openai"` provider works with any OpenAI-compatible API
- All code must call `getLLMModel()` from `src/config/llm.ts` — never import
  provider constructors (`anthropic()`, `openai()`) directly in feature code
- Move explanations are generated on-demand from server functions
  (not in worker jobs), since they're user-triggered

## Required context for move insight prompts
- Player rating
- Game phase (opening / middlegame / endgame)
- FEN before the move
- Move played (SAN) and best move (SAN)
- Eval before and after in centipawns, from player's perspective
- 2 moves before and after for context

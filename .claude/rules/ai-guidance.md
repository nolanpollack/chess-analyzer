# AI Agent Guidance

## Rules are the source of truth
All architectural, stylistic, and design decisions for this project are
recorded in .claude/rules/. These files are the persistent memory of
the project across sessions. AGENTS.md at the project root imports all
of them and is the entry point for both Claude Code and OpenCode (and any other agent).

## Mandatory: keep rules up to date
After ANY implementation decision not already covered by an existing rule:
1. Find the most appropriate rules file for that decision
2. Add a concise, specific rule documenting it
3. If no file fits, create a new one with a descriptive name
4. Do this BEFORE marking the task complete

This applies to: architecture choices, library usage decisions, naming
conventions, code patterns, DB conventions, prompt design, UI patterns,
or any other decision a future agent session would need to replicate.

## Rules file index
- ai-guidance.md — this file; how to maintain the rules system
- architecture.md — system design, data flow, interfaces, job pipeline
- code-style.md — TypeScript conventions, naming, imports, formatting
- db.md — schema conventions, enum policy, migration approach
- ai-prompts.md — LLM prompt design, concept taxonomy, versioning
- frontend/components.md — UI component patterns, shadcn usage, theming
- frontend/* — add new files here for additional frontend-specific rules

## When to create a new rules file
- The decision doesn't cleanly belong to any existing file
- A new area of the codebase is introduced (e.g. a new provider type)
- The existing file would exceed ~150 lines with the addition

## Rule writing guidelines
- Be specific enough to verify: "Use pgEnum for all fixed value sets"
  not "Use enums where appropriate"
- Include the reason when non-obvious
- Keep each rule to 1-3 lines

# Profile Feature — Server Functions

Server functions for the player profile feature: aggregated performance stats, rating trends, dimension drilldowns, and the player summary card.

These functions are the data layer for the profile dashboard (`/$username`). They read from `game_performance`, `player_profile`, `move_tags`, and related tables — they do not trigger analysis or modify game data.

Cross-cutting server functions (e.g. player lookup, sync) live in `src/server/`.

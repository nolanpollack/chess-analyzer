# Frontend Components

## UI library
shadcn/ui components are the default for all UI elements.
Install components with: bunx shadcn@latest add {component}
Never write custom implementations of components shadcn provides.

## Chess board
react-chessboard is the only chess board component used.
Always pass position as FEN string via the `position` prop.
Use `customArrows` prop for engine best-move arrows.
Use `customSquareStyles` for move classification highlighting.
Match board colors to shadcn theme via customDarkSquareStyle /
customLightSquareStyle using CSS variables.

## Theming
Use shadcn CSS variables (e.g. hsl(var(--primary))) for all colors.
Never hardcode color values in component files.

---
name: chess-design
description: >
  Design language guide for the chess-analyzer project. Inspired by Linear and Stripe —
  minimal, high-contrast, quietly refined. Use this skill whenever you are building,
  reviewing, or modifying any UI component, route, or page in this project. Trigger on
  any frontend task: adding a new page, writing a component, styling a table, handling
  loading/empty states, choosing colors, spacing, or layout. If the user says "build",
  "add", "create", "style", "design", "UI", "component", "page", or mentions anything
  visual in this project, use this skill.
---

# Chess Analyzer Design Language

The visual style is inspired by Linear and Stripe: minimal, high-contrast, and quietly
refined. Every screen should feel calm and intentional. When in doubt, remove — never add.

---

## Core Principles

- **Reduce, don't decorate.** No gradients, no shadows heavier than `shadow-sm`, no
  borders unless they separate meaningful groups. White space is the primary visual tool.
- **One thing per screen.** Each page has a single clear purpose. Don't combine unrelated
  content.
- **Content over chrome.** UI elements (nav, filters, controls) should recede. Data and
  content should dominate.
- **Every pixel earns its place.** If removing an element doesn't hurt comprehension,
  remove it.

All designs must be responsive and should look good in both desktop and mobile

---

## Colors

Use **only** shadcn CSS variables. Never reach for raw Tailwind colors like `bg-blue-500`
or `text-gray-400` — everything goes through the theme. This matters because the app
supports dark mode and raw color values will break it.

| Use case | Token |
|---|---|
| Interactive elements, links, active states | `text-primary`, `bg-primary` |
| Wins, positive states | `text-[hsl(var(--chart-2))]` (green) |
| Losses, errors, destructive actions | `text-destructive`, `bg-destructive` |
| Secondary text, metadata, draws | `text-muted-foreground` |
| Borders and dividers | `border` (the default border utility) |
| Card backgrounds | `bg-card` |

Color signals meaning — always pair color with text or an icon so it works for
colorblind users too.

---

## Typography

Pick from this scale only. Don't invent new sizes.

| Role | Classes | Usage |
|---|---|---|
| Page title | `text-2xl font-semibold tracking-tight` | One per page, top of content |
| Section header | `text-lg font-medium` | Group labels within a page |
| Body | `text-sm` | Default for all content |
| Secondary/meta | `text-sm text-muted-foreground` | Timestamps, labels, counts |
| Caption | `text-xs text-muted-foreground` | Fine print, helper text |

- Use `font-medium` and `font-semibold` only. Never `font-bold` in body content.
- `tracking-tight` on page titles only.
- Don't override Tailwind's default line heights.

---

## Spacing

Everything is on an 8px grid. Pick from these values:

| Gap | Size | When |
|---|---|---|
| `gap-2` | 8px | Tightly related items (icon + label, badge group) |
| `gap-3` | 12px | List items, table rows, form fields |
| `gap-4` | 16px | Sections within a card |
| `gap-6` | 24px | Between cards or major sections |
| `gap-8` | 32px | Between page-level sections |

Padding: Cards/containers use `p-4` or `p-6`. Page content area uses `px-6 py-6` or
`px-8 py-8`.

If two elements are the same type of content, they get the same spacing. Don't mix
arbitrarily.

---

## Layout

- **Max width:** `max-w-4xl` or `max-w-5xl` centered with `mx-auto`. Never full-bleed.
- **Single column** by default. Multi-column only when content naturally pairs (e.g.,
  chess board + move list).
- **Tables over cards** for list data — they're more scannable and information-dense.
  Use the shadcn `Table` component.
- **No sidebar** for now. Simple top header navigation only.

---

## Components

### Buttons

Only one primary (filled `variant="default"`) button per page. All secondary actions use
`variant="ghost"` or `variant="outline"`. This hierarchy makes the primary action obvious
without visual noise.

### Tables

```tsx
// Header: subtle, not dominant
<TableHead className="text-xs text-muted-foreground uppercase tracking-wide">

// Row separation via border, not zebra striping
<TableRow className="border-b">

// Text alignment: left for text, right for numbers
<TableCell className="text-right tabular-nums">
```

### Cards

Use `rounded-lg border bg-card` — no shadow unless it's modal/elevated. Cards are for
grouping related content, not decoration. A single stat doesn't belong in a card unless
it's part of a stat grid.

### Badges

Use shadcn `Badge` for categorical labels. Win/loss/draw: prefer a subtle
`variant="secondary"` or a small colored indicator — not a loud full-color block. Keep
badges small and unobtrusive.

```tsx
// Preferred: subtle result indication
const resultVariant = result === "win" ? "default" : result === "loss" ? "destructive" : "secondary"
<Badge variant={resultVariant}>{result}</Badge>
```

### Filter Bars

Horizontal row of `Select` dropdowns above the content they filter. `gap-2` between
controls. No "Apply" button — filters fire on change.

### Forms

- Labels above inputs, never inline.
- shadcn `Input`, `Select`, `Button` — don't invent alternatives.
- react-hook-form for all forms.
- Validation errors: `<p className="mt-1 text-sm text-destructive">{error.message}</p>`

---

## States

Every view must handle every state. Skipping one creates a bad user experience.

**Loading** — Skeleton placeholders that match the layout shape:
```tsx
<Skeleton className="h-8 w-48" />  // matches a heading
<Skeleton className="h-10 w-[140px]" />  // matches a select
```
Never a full-page spinner.

**Empty** — Short, helpful message centered in the content area. No illustrations.
```tsx
<div className="py-12 text-center text-sm text-muted-foreground">
  No games found. Try adjusting the filters.
</div>
```

**Error** — Inline, near the failed action:
```tsx
<p className="mt-1 text-sm text-destructive">Something went wrong. Try again.</p>
```
Include a retry action where applicable.

**Populated** — The normal view. Everything else is in service of this.

---

## Animation & Transitions

Almost none. The app should feel fast and precise, not animated.

- OK: `transition-colors duration-150` on hover states (buttons, table rows)
- OK: `animate-pulse` on loading skeletons
- Not OK: page transitions, slide-ins, bouncing, `hover:scale-*`, transform effects

If it feels static and correct, it is correct. Motion is not polish.

---

## Icons

- `lucide-react` exclusively — it's already bundled with shadcn.
- Inline with text: `size-4` (16px). Standalone actions: `size-5` (20px).
- Use icons sparingly. Most UI doesn't need one — text is clearer.
- Never an icon without an adjacent text label, except universally understood actions
  (close `X`, search magnifier).

---

## What Not to Do

These come up often — avoid them:

- Decorative dividers, ornamental lines, background patterns
- More than 2 font weights on a single page
- Borders on every element — use space to create separation
- `shadow-md` or heavier anywhere
- Custom color values outside the shadcn theme
- `hover:scale-*` or other transform effects on interactive elements
- Tooltips unless information literally cannot fit otherwise
- Raw Tailwind colors (`bg-blue-500`, `text-gray-400`, etc.)
- `font-bold` in body content

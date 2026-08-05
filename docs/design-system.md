# NY IRL — Design System

A reference for the UI as it's actually built. Use it to keep new screens
consistent and to onboard anyone contributing to the front end. For the
product rationale and visual direction behind these choices, see
[`design-vision.md`](./design-vision.md).

**Register:** sharp tech — light, high-contrast, cool neutrals. Luma / Vercel,
not warm boutique. Dense but calm; typography and a single near-black accent do
the work, not color or ornament.

---

## Foundations

### Color

All colors are CSS variables defined in `src/app/globals.css` (`:root`) and
exposed to Tailwind via `@theme inline` as semantic tokens. Never hardcode hex
values or use raw Tailwind colors (`bg-white`, `text-black`, etc.) in
components — always use the tokens below.

| Token | Value | Tailwind class | Role |
|---|---|---|---|
| `--background` | `#fafafa` | `bg-background` | Page background (near-white, cool) |
| `--surface` | `#ffffff` | `bg-surface` | Cards, header, raised elements |
| `--foreground` | `#09090b` | `text-foreground` | Primary text, solid accent fills |
| `--foreground-soft` | `#71717a` | `text-foreground-soft` | Secondary text, metadata, eyebrows |
| `--line` | `#e4e4e7` | `border-line` | Borders, dividers |
| `--accent` | `#18181b` | `text-accent` / `bg-accent` | Near-black accent |
| `--accent-hover` | `#27272a` | `hover:bg-accent-hover` | Hover state for solid buttons |
| `--accent-soft` | `#18181b0d` (5% black) | `bg-accent-soft` | Subtle tint fills, icon wells, nav hover |

**Rules**
- Palette is intentionally ~5 colors: two neutrals (`background`, `surface`),
  two text weights (`foreground`, `foreground-soft`), one line, one near-black
  accent. Do not introduce new hues without a deliberate reason.
- No purple/violet. No gradients. No decorative blurs or blobs.
- If you override a background, override its text color for contrast (e.g. the
  solid-accent button and strong score badge use `text-surface`).

### Typography

Two families only, both loaded via `next/font/google` in
`src/app/layout.tsx`:

- **Geist** (`font-sans`) — everything: headings and body. Weights 400/500/600/700.
- **Geist Mono** (`font-mono`) — labels, eyebrows, metadata, scores. Weights 400/500.

There is no serif. (`--font-serif` is mapped to Geist as a safety net; the
earlier Lora/cream "quiet luxury" direction was tested and rejected.)

| Use | Classes |
|---|---|
| Hero heading | `text-4xl sm:text-6xl font-bold leading-[1.05] tracking-tight text-balance` |
| Page heading (h1) | `text-3xl font-bold tracking-tight text-balance` |
| Card title (h2) | `text-base font-semibold tracking-tight` |
| Body | `text-sm leading-relaxed text-foreground-soft` (or `text-base` for lead paragraphs) |
| Eyebrow / section label | `font-mono text-xs uppercase tracking-[0.16em] text-foreground-soft` |
| Micro label (pills, meta) | `font-mono text-[10px]–text-[11px] uppercase tracking-[0.1em]–[0.12em]` |

**Rules**
- Headings: bold, tight tracking, `text-balance` on anything that wraps.
- Body: `leading-relaxed`, capped width (`max-w-md` / `max-w-xl`) for
  readability; use `text-pretty` on longer copy.
- Mono is reserved for machine-ish metadata (dates, counts, scores, category
  labels) — it signals "this is data," which supports the matching-engine story.

### Layout & spacing

- **Mobile-first.** Primary experience is mobile; enhance up with `sm:`/`md:`.
- **Content width:** `max-w-2xl` for list/content pages, `max-w-xl` for forms,
  centered with `mx-auto px-6`.
- **Layout method:** flexbox first; CSS grid only for the 2D category tile grid
  (`grid grid-cols-2 sm:grid-cols-3`).
- **Spacing:** Tailwind scale only (`p-4`, `gap-2.5`, `py-12`) — no arbitrary
  values. Use `gap-*` for spacing between siblings; never mix `gap` with
  `margin`/`padding` on the same element, and never use `space-*`.
- **List rhythm:** vertical card lists use `flex flex-col gap-2.5`.
- **Touch targets:** interactive elements ≥ 44px; nav links are `px-3 py-1.5`.

### Radius, borders, elevation

- `--radius: 0.625rem` → `rounded-lg` (cards), `rounded-md` (badges, thumbnails,
  nav items), `rounded-full` (pills, primary buttons).
- **No shadows.** Elevation is expressed with `border border-line` on
  `bg-surface`. This flat, bordered look is core to the register.
- Hover on cards: border darkens (`hover:border-foreground/25`), never a shadow.

---

## Components

### Header (`src/app/layout.tsx`)
Sticky, translucent, blurred: `sticky top-0 z-50 border-b border-line
bg-background/80 backdrop-blur-md`. Wordmark is `NY IRL` in
`text-sm font-bold uppercase tracking-[0.2em]`. Nav links are pill-shaped
(`rounded-md px-3 py-1.5`), soft by default, `hover:bg-accent-soft
hover:text-foreground`. The `Host` link only renders for the host user.

### Primary button
```
rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-surface
transition-colors hover:bg-accent-hover
```
Solid near-black on near-white. Smaller variant uses `py-2.5`. This is the only
"loud" element — one per view where possible.

### Eyebrow + heading pattern
Section intros use a mono uppercase eyebrow above a bold heading:
```tsx
<p className="mb-2 font-mono text-xs uppercase tracking-[0.16em] text-foreground-soft">
  Discover
</p>
<h1 className="text-3xl font-bold tracking-tight text-balance">Browse by category</h1>
```
On dark/marketing surfaces the eyebrow becomes a **status pill**: bordered,
with a small filled dot — `inline-flex items-center gap-2 rounded-full border
border-line bg-surface px-3 py-1 font-mono text-xs uppercase tracking-[0.14em]`.

### Category tile (homepage grid)
`bg-surface`, `border border-line`, `rounded-lg`, `p-4`,
`hover:border-foreground/25`. Leads with a mono index number
(`String(n).padStart(2, "0")`) above the label — reinforces the data feel.

### `ScoreBadge` (`src/components/score-badge.tsx`)
The algorithmic fit/quality score is a **feature, surfaced not hidden.** A
compact vertical mono badge: big number over a tiny uppercase label.
- **Tiering:** score ≥ 80 inverts to a solid near-black chip
  (`bg-foreground text-surface`); below 80 is a light bordered chip
  (`bg-surface text-foreground`, `border-line`).
- Always `tabular-nums`. Props: `score: number`, `label: string`
  (e.g. `"fit"`, `"quality"`).

### `RecommendationCard` (`src/components/recommendation-card.tsx`)
The shared row for the "Recommended for you" and category lists. One component,
two visually distinct item types:
- **Layout:** `flex items-center gap-4 rounded-lg border border-line bg-surface
  p-4`, `hover:border-foreground/25`.
- **Thumbnail:** 64×64 `rounded-md` image, or a fallback well
  (`bg-accent-soft` + `CalendarDays` icon) when there's no image.
- **Type marker (the key distinction):**
  - `kind: "event"` (hosted NY IRL events) → solid `NY IRL` pill
    (`bg-foreground text-surface`). These are pinned track record, not scored curation.
  - `kind: "link"` (external picks) → `Curated link` label with an `ArrowUpRight`
    icon; opens in a new tab (`target="_blank" rel="noopener noreferrer"`).
- **Meta:** mono uppercase — event date (`Wed, Jul 23`) or source label
  (`From around town`).
- **Score:** `ScoreBadge` pinned right when a score exists.
- Shared type `RecommendationItem` is exported and built by each page from its
  own data, so scoring logic stays in the pages and the card stays presentational.

### Icons
[`lucide-react`](https://lucide.dev). Sizes 16/20/24px (`h-4`/`h-5`/`h-6`).
Currently in use: `CalendarDays`, `ArrowUpRight`. No emoji as icons, ever.

### Status / info banners
`rounded-md border border-foreground/20 bg-accent-soft px-4 py-2.5 text-sm
text-foreground` for notices (e.g. "Complete your profile before applying").
Neutral confirmation uses `border-line` instead.

### Inline links (in prose)
`font-medium text-foreground underline underline-offset-4 decoration-line
hover:decoration-foreground` — underline darkens on hover rather than a color
change, keeping the palette tight.

---

## Do / Don't

**Do**
- Use semantic tokens for every color.
- Keep one primary (solid-accent) action per view.
- Lead metadata with mono uppercase; keep scores visible.
- Express hierarchy with type weight, size, and spacing — not color.

**Don't**
- Add new colors, gradients, purple, or decorative shapes.
- Use shadows for elevation (use borders).
- Reintroduce serif or the cream/warm palette.
- Hand-roll a second card/badge — extend the shared components.

---

## Reference files
- Tokens & fonts: `src/app/globals.css`, `src/app/layout.tsx`
- Components: `src/components/score-badge.tsx`, `src/components/recommendation-card.tsx`
- Screens using the system: `src/app/page.tsx`, `src/app/category/[category]/page.tsx`,
  `src/app/profile/page.tsx`, `src/app/sign-in/page.tsx`,
  `src/app/curate/page.tsx`, `src/app/events/[id]/apply/page.tsx`,
  `src/app/events/[id]/host/page.tsx`

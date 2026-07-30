# NY IRL — IA & Funnel Rearchitecture Spec

Date: 2026-07-27 (rev 3)
Written for handoff to Claude Code.

---

# ⚠️ SCOPE: PART A IS FRONTEND ONLY

**Part A changes presentation only. It must not change behavior, data, or scoring.**

Everything in Part A reads from the database exactly as the app does today and writes
nothing new. If a change in Part A appears to require a schema change, a migration, a new
server action, or a scoring change — **stop and flag it. Do not proceed.**

### Do not modify, in Part A

| Path | Why |
|---|---|
| `src/db/schema.ts` | No new columns, tables, or enums |
| `drizzle.config.ts`, any migration | No schema pushes |
| `src/lib/scoring.ts` | Every score must stay numerically identical |
| `src/lib/actions/*` | No server action signature or behavior changes |
| `src/lib/og-meta.ts` | No scraper changes |
| `src/lib/digest.ts`, `src/lib/embeddings.ts`, `src/lib/unsubscribe.ts` | Untouched |
| `src/auth.ts`, `src/app/api/**` | No auth or route-handler changes |
| `scripts/**` | Untouched |

### Free to modify, in Part A

`src/app/**/page.tsx` and `layout.tsx` (presentation logic only), `src/components/**`,
`src/app/globals.css`, and `public/**`.

### Verification before merging Part A

1. `src/db/schema.ts` has zero diff.
2. `src/lib/scoring.ts` has zero diff.
3. No new files under any migrations directory.
4. A given profile sees the same items in the same order, with the same numbers, as before.
   Ordering and score values are unchanged — only their appearance changes.

**Part B is separate and explicitly does touch the backend.** Do not begin Part B without
confirmation. Do not merge Part A and Part B into one change.

---

## 0. Direction

NY IRL is a curated guide to NYC tech events: a brand landing page, a profile-gated entry,
and a personally ranked Discover feed with category filtering in the margin.

The register is quiet and editorial — warm paper, soft black, restrained type, hairline
structure. One saturated moment at the front door, then restraint everywhere inside.

Curated events remain pointers to their real homes. Every curated listing links out to its
Luma or Partiful page and shows the image and description already scraped from it. NY IRL
decides what's worth your time; it isn't a replacement destination.

**This supersedes `docs/design-vision.md`** on its visual-identity row (sharp/premium,
Luma-Vercel register) and item A3 (public signed-out surface). Update that doc as part of
this work, or the repo will hold two documents pointing opposite directions.

**Typography is unchanged.** Keep the four families already loaded. Introduce no new face.
Use no italics anywhere in the product.

---

# PART A — Frontend

## A1. Design tokens

### Color

Replace the values in the `:root` block of `src/app/globals.css`. Preserve the
`@theme inline` block and the global `focus-visible` treatment exactly — only values change.
Variable names are unchanged so no consuming component needs edits beyond the ones specced
below.

```css
:root {
  --background:       #F6F5F3;  /* paper — was #f9f7f1 */
  --surface:          #FDFCFA;  /* was #fdfcf8 */
  --foreground:       #1F1F1F;  /* soft black — was #0a0a0a */
  --foreground-soft:  #6C6C6C;  /* was #62748e */
  --line:             #E0DED9;  /* was #e5e2d5 */
  --accent:           #C6714C;  /* terracotta — was #101828 */
  --accent-hover:     #7B553A;  /* umber — was #2a3444 */
  --accent-soft:      #C6714C14;
  color-scheme: light;
}
```

Add two new variables plus their `@theme inline` mappings:

```css
--foreground-faint: #B4B2A9;  /* category counts, tertiary metadata */
--cream:            #E9E0D4;  /* fills, active chips, hover */
```

Also update `viewport.themeColor` in `layout.tsx` from `#f9f7f1` to `#F6F5F3`.

Landing-only gradient stops: `#C85A28` → `#E39B8B`. Used on `/` and nowhere else.

### Type — unchanged

Keep all four families currently loaded in `src/app/layout.tsx`. No new faces, no
substitutions, **no italics anywhere**.

| Variable | Face | Role |
|---|---|---|
| `--font-serif` | Lora | Event and page titles |
| `--font-sans` | Manrope | Body copy, descriptions, form labels and inputs |
| `--font-geist` | Geist | Wordmark, nav |
| `--font-mono` | Geist Mono | Eyebrows, category counts, fit scores |

Where emphasis is needed, use weight, size, color, or letter-spacing — never italic.

Sizing runs small and tight: 15–18px titles, 12–13px descriptions, 11px metadata, 10px
eyebrows. Line-height 1.55 on body copy.

**Do not carry over from the moodboard reference:** the rotating logo, the scroll-position
page transition, the collage grid. Motion is limited to hover and focus transitions.
Respect `prefers-reduced-motion`.

## A2. Navigation

Header nav for signed-in members, in this order:

**Discover · Applied · Profile**

Plus **Host** appended for the host, as today. (**Saved** joins this list in Part B — it
needs a table to store saves. Do not ship a Saved tab in Part A.)

Sentence case, Geist, existing `navLink` sizing and hover. Active item takes `--foreground`
with a terracotta underline. Wordmark stays at left, Geist, uppercase, `tracking-[0.22em]`.
Signed-out header shows the wordmark and **Sign in** only.

`/applications` is renamed to `/applied` — a directory rename plus a redirect. The page's
data fetching and server actions are untouched.

## A3. Route changes

| Route | Change |
|---|---|
| `/` | Signed out: new landing. Signed in: redirect to `/discover`. |
| `/discover` | The current `/` page content, restructured per A5. |
| `/discover?category=x` | Filter in place, replacing navigation to a category route. |
| `/category/[category]` | 301 to `/discover?category=x`. Keep the redirect — links exist. |
| `/applied` | Renamed from `/applications`, plus a redirect. Content unchanged. |
| `/apply` | The existing `/profile` form, reframed. See A6. |
| `/profile` | Kept as-is for editing after entry. |

Gating in Part A uses the **existing profile-completeness check** — `fullName`,
`profileType.length > 0`, and a non-empty `bioBlurb`, exactly as `src/app/page.tsx`
computes today. No new access states, no approval status. Move that computation into a
shared helper in `src/lib/` so the three routes that need it stop re-deriving it inline;
the logic itself must stay identical.

## A4. `/` — Landing

One screen. No scroll-jack, no auto-advance.

- Full-bleed vertical gradient, `#C85A28` → `#E39B8B`, top to bottom. Static.
- **No logo mark.** The wordmark is the focal element. Do not add an image, icon, or
  illustration to this page.
- Wordmark centered and large: Geist, uppercase, `letter-spacing: 0.22em`, cream `#F6F5F3`.
  Scale it to carry the page on its own — roughly 15–20% of viewport width on desktop,
  with generous space above and below. The gradient does the rest of the work.
- One line beneath in Lora, regular weight, not italic. "Be in the right room" works.
- Primary action: **Get started** — cream fill, `#1F1F1F` text, `--radius`.
- Secondary, small: **Sign in**. Don't bury it; returning members land here too.
- Footer: one line, cream, low emphasis. No nav.

**No image assets are required for this page.** Type and gradient only. Do not add
placeholder art, an SVG skyline, a generated icon, or a favicon-derived mark. If the page
looks sparse, the fix is larger type and more space, not an illustration. A logo mark may
be reintroduced later as its own change.

Metadata: this page carries the site's SEO and OG weight. Real `<title>`, description, and
an OG image — wordmark on the gradient, 1200×630, no mark.

## A5. `/discover` — the core screen

Two columns on desktop. Left rail 148–180px with a hairline right border; right column is
the ranked list.

### Left rail — categories

- Eyebrow `BROWSE`: Geist Mono, 10px, tracked, `--foreground-soft`.
- Vertical list. "All" first, then categories **sorted by live count, descending**, count
  beside each label in Geist Mono, `--foreground-faint`.
- **Show every category in the taxonomy, including those with zero upcoming listings.**
  A category with nothing in it renders normally with a count of `0`. Do not filter the
  list by count. The rail advertises what the site covers, not only what is currently
  booked. Zero-count items are not dimmed, disabled, or visually separated — same
  treatment, the count carries the information.
- Cap at 12 visible so the current taxonomy fits without truncation. Beyond that, overflow
  collapses behind a `More` toggle in terracotta that expands in place — no new route, no
  italics.
- Ties in count sort alphabetically, so the zero-count block has a stable order.
- Active item: `--foreground`, weight 500, terracotta left indicator.
- **The rail filters; it does not navigate.** Selecting a category sets `?category=` and
  re-renders the same ranked list scoped to it. This is a filter applied before sort, never
  a re-sort. Ranking is untouched.

Counts come from the same `categoryCounts` computation already in `src/app/page.tsx` —
reuse it, sorted for display only. Do not add a `count > 0` filter.

### Right column — the list

- Title "Recommended for you": Lora, 18px. Subtitle in Manrope, 13px, `--foreground-soft`:
  "Ranked against your profile." When a category is active, the subtitle names it.
- Rows separated by hairlines. **Not cards** — no radius, no fill, no border box. This is
  the main change from the current `ListingCard` and it's what makes the screen read as
  editorial rather than as a feed.

**Row anatomy — three columns: thumbnail, content, score.**

- **Left — thumbnail.** 56px square, `rounded-md`, `object-cover`, from the existing
  `link.imageUrl`. Retained. Rows without an image fall back to a plain `--cream` block
  with a small inline glyph — no checked-in asset, per §A4.
- **Middle — content.**
  - Eyebrow, Geist Mono 10px tracked caps, **`--foreground-soft` for every row type**.
    Curated: `TUE, AUG 11 · AROUND TOWN`. Hosted: `THU, AUG 6 · HOSTED BY NY IRL`. No
    color distinction between them — the eyebrow text and the external-link glyph carry
    the difference. (Real host names replace `AROUND TOWN` in Part B — the field doesn't
    exist yet.)
  - Title, Lora 15px, `--foreground`.
  - Description, Manrope 12px, `--foreground-soft`, clamped to two lines, from the existing
    scraped `description`.
  - `ReasonChip` beneath — existing component, unchanged, Geist Mono 11px, not italic.
- **Right — score. Every row shows one, hosted and curated alike.** `FitScore`, pinned
  top-right with `align-items: flex-start`. **Same component, same font, same colors.**
  Tier label stays Geist Mono 10px uppercase tracked; numeral stays Geist Mono, tabular,
  `--foreground`. The only change is size: **`text-lg` → `text-2xl`.** This is the one
  place in the design that is deliberately loud.

  Hosted events already have a score — `computeStructuralScore(profile, criteriaWeights,
  tags)` is computed for them on this page. Pass it and its `describeFit` tier to
  `FitScore` exactly as curated links do. Do not invent a second scoring path, do not
  rescale, and do not modify `lib/scoring.ts`. The number displayed must be the number
  already computed. An empty score column is not an acceptable state for any row.

**Every curated row links out**, to the existing tracked `/api/out` href, new tab, exactly
as today. The row is one link target. Add a small external-link glyph after the title so
the destination isn't a surprise. Hosted events link in-app to `/events/[id]/apply`.

**"This week."** The `tech_week_cluster` scroller stays, moved above the list heading,
rendered as a tracked-caps line plus inline links rather than a card carousel. Hidden when
empty, as today.

**Impression logging.** The existing `after()` + `logImpressions` call moves with the page
unchanged. Keep `source: "homepage"` as the literal string — changing it would split the
`interaction_events` history that the Horizon B re-ranker will train on. Rename it in Part B
alongside a backfill, or not at all.

## A6. `/apply` — the entry form

The existing `/profile` form, reframed. **Same fields, same server action, same validation.**
Only copy, grouping, and layout change.

1. **Who you are** — full name, email, profile type. Required.
2. **What you're working on** — bio blurb, plus the type-conditional fields from
   `profile-type-fields.tsx`. Required: bio.
3. **What you're into** — interests, and optionally gender and age range. All optional and
   labeled as such; framed as sharpening matches, not gating them. The existing decision not
   to require these stands.

Single column, ~560px, generous vertical rhythm, hairline dividers between groups. Lora for
group headings, Manrope for labels and inputs. No progress bar, no wizard — one page, one
submit. On success, redirect to `/discover` rather than staying in place.

## A7. Mobile

- The rail collapses to a horizontal chip strip beneath the header. Reuse the existing
  snap-scroll pattern from the `techWeek` row:
  `-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5`.
- Chips: hairline border, `--radius`, Manrope 12px. Active chip fills `--cream`.
- Same sort and zero-count hiding as desktop. `More` becomes the last chip.
- Rows stay three-column — the 56px thumbnail and the score both hold at mobile width. Drop
  the description to one clamped line below 400px.
- Landing: mark scales to ~60vw, gradient unchanged, actions stack full-width.

Preserve the existing global `focus-visible` treatment exactly when replacing the token
block.

## A8. Part A build order

1. Color tokens in `globals.css` + `themeColor`. **Leave font loading untouched.**
2. Shared profile-completeness helper (logic identical, location only).
3. Nav: order, labels, active state; `/applications` → `/applied` with redirect.
4. `/discover` — move page content, build rail, three-column row, enlarged `FitScore`.
5. `/category/[category]` redirect.
6. `/apply` reframe.
7. New landing at `/` — type and gradient only, no image assets.
8. Mobile chip strip.
9. Rewrite the visual-identity and A3 rows in `docs/design-vision.md`.

---

# PART B — Requires backend. Do not start without confirmation.

Three features from the original brief cannot be built in the frontend. Each is listed with
exactly what it touches. They are independent — ship any subset.

## B1. Saved events

**Needs a table.** There is nowhere to store a save today.

- New `saved_items` table: `id`, `userId`, `kind` (`"event" | "link"`), `itemId`,
  `createdAt`, with a unique constraint on `(userId, kind, itemId)`. The constraint is
  load-bearing — save is a toggle and double-clicks are common.
- New server action to toggle.
- **Nav:** **Saved** joins the header between **Applied** and **Profile**, so the order
  becomes **Discover · Applied · Saved · Profile** (plus **Host** for the host). Same
  `SiteNav` active-state treatment as the other items.
- **Save control:** a bookmark affordance on each Discover row, bottom-right of the content
  column, **outside the main link target** so it doesn't hijack the click. Filled state in
  terracotta.
- **`/saved` page:** reuses the `DiscoverRow` treatment with no category rail and **no score
  column**. Most recently saved first, mixed hosted events and curated links. This matches
  `/applied`, which also shows no scores — the score is a discovery signal, and once
  something is saved the decision is already made.
  - Rows keep their outbound link and their save toggle, so unsaving from here removes the
    row from the list.
  - Empty state uses the existing `EmptyState` component, pointing back to Discover.

Touches: `schema.ts`, one migration, one new action, `layout.tsx` nav, the row component,
one new page.

## B2. Real host names on curated links

**Needs a column and a scraper change.** `curatedLinks` stores `sourceUrl`, `title`,
`description`, and `imageUrl` — no host.

- Add `curatedLinks.hostName` (nullable text).
- Extend `fetchLinkPreview` in `og-meta.ts` to extract it. Luma exposes the host in the same
  embedded JSON blob the date scraping already parses — reuse that parse, don't add a second
  fetch. Partiful differs; extract where available, leave null otherwise. **Never guess or
  infer a host name.**
- Backfill by re-scraping existing rows.
- Frontend: the row eyebrow becomes `TUE, AUG 11 · GUILDS BY FIRSTMARK`. Where `hostName` is
  null, show the date alone — not a placeholder.

**`hostName` must stay display-only.** Do not feed it into `TIER_ONE_HOSTS` detection, which
stays on title and description text. Wiring real host names into scoring would be more
correct but would silently shift every CQS value in the system; that belongs in its own
change with a before-and-after comparison.

Touches: `schema.ts`, one migration, `og-meta.ts`, a backfill script, the row component.

## B3. Application and approval gate

**The largest of the three.** Needs schema, an admin surface, and transactional email.

- `profiles`: add `applicationStatus` (`draft` | `pending` | `approved` | `waitlisted`),
  `submittedAt`, `reviewedAt`, `reviewedBy`, `reviewNote` (internal, never rendered),
  `approvalEmailSentAt`.
- **Backfill every existing profile to `approved` before deploying.** Anyone who already
  built a profile must not be locked out.
- Replace the profile-completeness gate from A3 with a full access-state helper:
  `signed_out` / `no_application` / `pending` / `approved` / `waitlisted`. Enforce in server
  components, not middleware — the state needs a DB read and middleware runs on the edge.
- New `/pending` route: two copy variants, one layout. **Never use the word "rejected"** in
  the UI or the codebase; waitlisted is the term.
- New `/admin/applications` review queue: pending list oldest-first, expand for the full
  application, Approve and Move to waitlist, optional internal note, status filter tabs.
  Utilitarian styling — internal surface, don't spend design effort.
- **De-hardcode the host first.** `HOST_USER_ID` is inlined in four files and an admin route
  would make five. Add `users.role` (`member` | `host` | `admin`) and replace all literals
  with `isHost()` / `isAdmin()` checks.
- `saveProfile` must become an atomic upsert (roadmap A1) — a race that drops the status
  write strands the applicant.
- Fix `/sign-in` to honor `?next=` (roadmap A1); its default target becomes `/apply`.

**Resend becomes a launch blocker.** Approval-gated access without transactional email means
approved applicants are never told. Needed: account, API key, verified sending domain. The
`onboarding@resend.dev` default only delivers to the account owner's own inbox.

**Review latency enters the funnel.** Roadmap priority #1 is a user onboarding push; a queue
with one reviewer adds a human-speed step to the funnel you're trying to grow. Decide the
turnaround commitment in advance — the `/pending` copy should state it.

Touches: `schema.ts`, migration + backfill, `auth.ts`, four files with the host UUID,
`lib/actions/profile.ts`, digest email config, three new routes.

---

## Open items

**Optional — public event permalinks.** The walled landing means nothing is shareable or
indexable, which is in tension with the "recognized resource" success metric. A `/e/[id]`
route rendering one item publicly with rich OG tags recovers sharing without opening the
index. Deferred.

**Font count.** Four families remain loaded per instruction. Geist and Manrope are both
geometric sans covering adjacent roles; dropping Geist and letting Manrope carry the
wordmark would reach three without changing the feel. Not actioned.

**Unaffected roadmap A1 items still stand** and are out of scope here: unsubscribe
side-effect-on-GET, registration IDOR, cron fail-open, duplicate registrations, UTC date
rendering. All remain blocking for launch.

**Carried forward:** age range still has no event-side signal to score against. Founder
Mahjong Night still needs its Luma URL.

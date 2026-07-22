# NY IRL — Session Recap (2026-07-22)

A working log of one day's worth of changes to the NY IRL scoring, curation, and matching system, written up for a teammate to get oriented without reading the commit history line by line.

## 1. Event category taxonomy audit

Went through every event Serena curated or hosted from April–July (~55 events across Luma, Partiful, X threads, etc.), assigned each one a category from the existing eleven-value enum (`founders`, `engineers`, `vcs_investors`, `operators`, `ai`, `health_fitness`, `robotics`, `hackathons`, `marketing_gtm`, `design`, `networking`) plus a set of orthogonal tags for things category can't express (`tier_1_host`, `invite_only`, `social_lifestyle`, `tech_week_cluster`, `out_of_town`, `luxury_fashion`).

**Headline finding**: of those ~55 events, only one was still upcoming as of the audit date. That wasn't a categorization problem — `curatedLinks` had no event-date field at all, so the app had no way to tell a live link from a dead one.

## 2. Category becomes required, category pages become real

- `category` is now `NOT NULL` on both `events` and `curatedLinks` — every listing has to be classified.
- New route `/category/[category]` — homepage category tiles are real links now, not just informational counts.
- Along the way, found and fixed three **live production** curated links that had a null category due to a bug in the bulk-paste AI extraction flow (it wasn't asking the model to classify category on the multi-event path). Fixed the extraction schema and prompt.

## 3. Curation Quality Score (CQS) + homepage restructure

Added a second scoring axis, independent of any one visitor's profile, so category pages have a sensible default order before someone has a profile:

```
CQS = host_tier (0 or 40) + exclusivity (5/15/25) + format (5/10/15/20) + locality (0 or 15)
```

- **Host tier**: detected from title/description text against a growable `TIER_ONE_HOSTS` allowlist in `lib/scoring.ts` (Anthropic, Vercel, YC, First Round, M13, etc.) — same mechanism the existing link-fit scorer already used, just expanded.
- **Exclusivity / format**: explicit fields (`linkExclusivityEnum`, `linkFormatEnum`) set at curation time.
- **Locality**: `outOfTown` boolean — Boston Tech Week events, e.g., are well-curated but excluded from the NYC-branded homepage by default.

Signed-in users with a complete profile get `computeBlendedLinkScore = 60% personal fit + 40% CQS` — the same 60/40 split already used for registrant scoring (structural/semantic).

**Homepage/category page behavior**:
- Filters to upcoming-only (`eventDate >= now` / `date >= now`) — no more accumulating dead links.
- Serena's own hosted events always pin above scored links (they're not "curated," they're hers).
- A "This week" row surfaces anything tagged `tech_week_cluster`, hidden when empty.

Also added real Luma-date scraping (`lib/og-meta.ts`) — Luma buries the actual event date in an embedded JSON blob (`"startDate"` or `"start_at"` depending on page template), not in `og:meta`, so the old preview fetcher never had a date to work with at all.

## 4. Profile enrichment: gender, age range, interests

Three new **optional** fields on `profiles` — deliberately never required for "complete profile" status, since gating recommendations on disclosing gender/age isn't acceptable:

- `genderIdentity` (woman / man / non_binary / prefer_not_to_say)
- `ageRange` (bucketed, not exact birthdate)
- `interests` — a **fixed vocabulary** (pickleball, pilates, boxing, yoga, running, tennis, golf, cycling, strength_training, wine, live_music, art), not freeform, so it can overlap-match deterministically against event/link tags — same reasoning as why `category` is a fixed enum rather than free text.

Wired into scoring as strictly additive boosts (never a penalty for leaving a field blank or not matching):
- Interest-tag overlap → up to +20
- Gender-orientation match (e.g. a `womens_focused` tag matching a "woman" profile) → +15

Also added `interest_match` / `gender_orientation_match` as optional criteria in `computeStructuralScore`'s rubric type, so a host can weight these into a specific event's own scoring the same way as `profile_type_match`.

Age range is **collected but not yet scored** — there's no real event-side age/seniority signal to match against yet beyond one manually-tagged example (`senior_professionals` on Guilds by FirstMark). Didn't want to fabricate a rule with nothing real on the other side of the match.

## 5. Weekly personalized digest agent

An autonomous Vercel Cron job (`/api/cron/weekly-digest`, Mondays 9am ET) that:

1. Scores every currently-upcoming curated link against every profile with `digestOptOut = false`, using the same blended fit+CQS logic as the homepage.
2. Only includes links scoring **≥ 80** — "better to skip a week than send a weak pick." Serena's own hosted events always make the cut, unscored.
3. Sends via Resend if — and only if — at least one item qualifies. No filler "nothing much this week" email.
4. Records what went out in a new `digest_sends` table, so nothing repeats across weeks even if it stays upcoming.

Dry-run against real data confirmed the bar is genuinely selective: on the day this was built, none of the 8 real upcoming curated links cleared 80 for the one seeded profile — only the pinned hosted event would have gone out that week. That's the threshold working as intended, not a bug.

**Still needs, before it can actually send**: a Resend account + API key, a `CRON_SECRET`, both as Vercel env vars, and (eventually) a verified sending domain in Resend — the default `onboarding@resend.dev` sender can only deliver to the Resend account owner's own inbox until that's done.

## 6. Every profile now requires an email

Added `profiles.email` (`NOT NULL`), separate from the OAuth login email on `users` — editable on the profile form, defaults to the sign-in email but can differ (e.g. a work email for digest/host follow-ups). Backfilled for existing rows. Simplified the digest cron to read `profile.email` directly instead of joining through `users`, removing a silent-failure path where a profile with no resolvable user email would just get skipped without anyone noticing.

## 7. Naming: "Curate" → "Host"

The nav link and the internal tool's copy ("Curate a link" → "Add to what you host", "Manage what you've curated" → "Manage what you host") now use host-flavored language, per Serena's direction. The `/curate` route and internal file/function names (`addCuratedLink`, `curated-links.ts`, the `curated_links` table) deliberately stayed as-is — renaming those too would collide with the *existing*, different meaning of "host" in this app (hosting your own event, `/events/[id]/host`).

## 8. Removed: the host co-host chat bot

The earlier AI assistant widget — a floating chat popup where the host could ask natural-language questions about applicants (`streamText` + tool-calling over `listEvents`/`getApplicantsForEvent`/`getApplicantHistory`) — has been fully removed: the route, the tool definitions, the widget component, and its mount point in the layout. Clean removal, no other code depended on it.

## Current scoring system, in one place

**Registrant scoring** (someone applying to an event Serena hosts):
`structural` (deterministic, host-weighted rubric) × 60% + `semantic` (AI reads bio/resume against the event's ideal-attendee brief, falls back to neutral 50 without an API key) × 40% = `composite`.

**Discovery/digest scoring** (ranking things for someone browsing, or in their weekly email):
`personal fit` (keyword overlap + tier-1 host boost + interest/gender boosts, no AI call) × 60% + `Curation Quality Score` (host tier + exclusivity + format + locality, no profile needed) × 40% = `blended score`. This is what sorts category pages and gates the digest at 80.

Serena's own hosted events skip both systems and just pin to the top, unscored.

## Open items

- Founder Mahjong Night still needs to link directly to its Luma page instead of the in-app apply flow — waiting on the actual Luma URL.
- Resend account/API key + `CRON_SECRET` need to be set up before the digest can send real email.
- Age range has no scoring signal to match against yet.
- Two events from the original curation audit (Amplify, a `@thebc12` thread reference) were dropped rather than guessed at — worth resolving if they come up again.

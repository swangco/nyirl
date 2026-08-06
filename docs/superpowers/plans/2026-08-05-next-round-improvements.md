# NY IRL recommender — next round

**Goal:** Fix the highest-leverage broken signals, and make the filter
validatable at all.

**Status:** DRAFT — for adversarial review before any implementation. Four of
five proposals were correctly rejected the last two times this was done. Assume
the same rate here.

---

## The measured situation

Everything below is verified against the live database today, not recalled.

| Fact | Value | Implication |
|---|---|---|
| Total clicks, all time | **3** | Nothing can be learned from engagement |
| Impressions | 435, but only 3 users × 8 items | Coverage is negligible |
| Links carrying an interest tag | **3 / 40** | A signal worth more than everything else is dark |
| One matching interest tag | **+10 pts** | vs **15 pts** for the ENTIRE quality prior, best-to-worst |
| Two matching tags | **+20 pts** (cap) | Outweighs host, exclusivity, format, locality, room size combined |
| `exclusivity` | 33/40 `capped` | It's the bulk-import LLM's default, not a fact about the event |
| Link embeddings stale | **40 / 40** | Descriptions widened 157→1,214 chars; vectors still from the old text |
| Rejected candidates stored | **0** | Serena discards ~80% and none of it is recorded |
| Rows from one unreviewed bulk paste | **31 / 40** | A Google Form, an X profile and a calendar index page are in the corpus |

---

## Proposals

### P1 — Make interest tags capturable, and capture them

**Claim.** This is the largest unexploited lever in the system by a wide margin,
and it is currently impossible for Serena to use.

`computeInterestBoost` gives +10 per matching interest tag, capped at +20.
Measured: the entire Curation Quality Score, from a best-case listing (93) to a
worst-case one (18), moves the final score by **15 points** at weight 0.2. So a
single tag beats the whole editorial quality system, and two max it out.

Neither `addCuratedLink` nor `addCuratedLinksBulk` ever writes `tags` — both
hardcode `tags: null` — and there is no tag input on the add-link form. The
enum already exists: pickleball, pilates, boxing, yoga, running, tennis, golf,
cycling, strength_training, wine, live_music, art.

Note what Serena's three "interesting" examples actually are: US Open suite
(**tennis**), Michelin tasting (**wine**), boxing class (**boxing**). All three
are already in the enum. The criterion she described as global taste is, for
these examples, *personal interest matching* — which is a per-user signal, not a
gate.

**Build:** a tag multi-select on the add-link form; write `tags` on both ingest
paths; a backfill that proposes tags for the existing 40 from title/description
keywords and lets Serena confirm.

### P2 — Persist rejected candidates

**Claim.** Without a negative class, nothing about curation can be validated,
ever. A filter's only job is to discard; measuring one on a table containing
only keeps measures nothing. Serena discards ~80% and zero of it is stored.

**Build:** a `candidate_links` table (url, title, source, verdict
`kept|rejected|pending`, reason, decided_at). Bulk import writes candidates
rather than links; promoting a candidate creates the curated link.

### P3 — Read exclusivity from the listing instead of guessing

**Claim.** `exclusivity` is 33/40 `capped` not because Luma caps headcount but
because the bulk-import prompt falls through to `"capped"` as its default. The
field Serena's "open to public is bad" rule depends on is therefore noise.

Luma's JSON-LD — which we now parse for host and description — also carries
registration/approval state.

**Build:** derive exclusivity in `og-meta.ts`; keep the manual value as an
override.

### P4 — Add a review step to bulk import

**Claim.** `addCuratedLinksBulk` inserts every URL the LLM returns with no
review. That is how a Google Form, an X profile and a calendar index page got
into the corpus. Falls out of P2 for free.

### P5 — Quantify what the description bug cost

**Claim.** The scraper fix is currently unmeasured. Simulate it: truncate the
synthetic corpus's event descriptions to ~150 chars + ellipsis, re-embed,
measure P@5 / NDCG against the untruncated baseline. That number tells us
whether the fix mattered and how much.

**BLOCKED:** requires ~200 new embeddings. No OpenAI key locally, and
`/api/admin/embed` exists only on this branch, which isn't deployed. Unblocks on
deploy.

### P6 — REJECTED before review: learn from engagement

Three clicks. Any reranker, CTR prior, or click model fitted on this would be
fitting noise, and would look like progress. Explicitly not doing it. Revisit at
~1,000 clicks.

---

## What I most expect to be wrong

- **P1's premise that tagging is Serena's job.** 40 links/month × picking from 12
  tags is real work, and if she won't do it the feature is dead weight. An
  automatic tagger might be better — or might reintroduce the substring-collision
  failure that has now bitten this codebase three times ("C-Suite" matching the
  US Open "suite").
- **P1's arithmetic might be an argument for changing the boost, not for feeding
  it.** If one tag genuinely outweighs the entire quality prior, perhaps +10 is
  simply too large and the cap should come down. That is a one-line change and
  the opposite conclusion.
- **P3 may be unavailable.** I have not confirmed Luma's JSON-LD actually
  distinguishes approval-required from open registration.
- **P2 may be over-built.** A new table plus a promotion flow is a lot; a
  `verdict` column on `curated_links` might capture the same thing.


---

# Outcome, 2026-08-06: two reviewers, four of five proposals rejected

Consistent with the previous two rounds. Every rejection below is backed by
live-data measurement, not argument.

## P1 — interest tags: **REJECTED**, and the conclusion inverted

The premise was right and the inference from it was backwards.

- **Perfect oracle tagging of all 40 live links changes ZERO top-10 memberships
  and ZERO orderings, for all four live profiles.** Only 5 of 40 listings
  deserve an `interestTagEnum` value and 3 already carry one. The proposal built
  three surfaces to capture **two tags**.
- On the gold set, going from live-like sparsity to full tagging is
  **ΔP@5 = 0.0pp, t = 0.00, +4/−4**, with NDCG and FP@10 both directionally
  worse.
- The enum is a *lifestyle-hobby* vocabulary (pickleball, yoga, wine…). The
  corpus is professional tech events. They barely intersect. Serena's three
  "interesting" examples map onto it only by survivorship — she named three
  memorable evenings; her actual output is 40 mixers and demo nights.
- A keyword auto-tagger runs at **13% precision** (substring) or **40%**
  (word-boundary). A bank's sponsor boilerplate on a pickleball listing pays out
  `strength_training`. Fourth recurrence of a collision class already reverted
  three times.

**Shipped instead: the boost was HALVED** (`hits*10 cap 20` → `hits*5 cap 10`).
A magnitude sweep shows NDCG peaking around +2–5, flat to +10, and degrading
significantly above (+20 → t = −3.08, +30 → t = −3.59). At the old +10 one tag
was worth 77% of the entire live quality range; two exceeded it. This is a
risk-asymmetry decision, not a significant result (+10→+5 is t = 1.64) — the
downside of being too large is measured, the downside of being smaller is not.
Deliberately not zero: removing it is also within noise, and the blind judges
did use hobby matches as a tiebreaker, which is what it now is.

**Left undone, deliberately:** `curated_links.tags` is a junk drawer serving at
least five vocabularies, including the load-bearing `tech_week_cluster` feed key.
Splitting it is right, but the urgency was entirely a consequence of building the
multi-select — which we are not.

## P2 — persist rejected candidates: **REJECTED as specified**

- **Zero interaction_events point at a deleted link**, which proves Serena has
  never removed one in-product. There is no reservoir of past rejections.
- 31 of the 40 rows arrived **in 16 seconds**. That is a paste-and-walk-away,
  not a curation session. A candidate queue instruments a per-item workflow that
  does not exist, and yields a dataset of size 0 on day one.
- The plan's own fallback (a `verdict` column) is *worse* than the table it
  doubts: nine queries read `curated_links` and **seven would fail silently** —
  the feed would rank rejects, the digest would email them, and the impression
  logger would contaminate the only behavioural dataset.

**Shipped instead:** `removeCuratedLink` was a hard `DELETE`; it now archives to
a separate `removed_links` table first. Fail-safe by construction — no existing
query can see archived rows — one table, no UI, no filter changes. Honest
about what it is: it yields nothing today and only stops future loss.

## P3 — derive exclusivity from the listing: **REJECTED**

Luma does publish `ticket_info.require_approval`, but it is 26 true / 4 false /
10 absent, and deriving from it turns "82% capped" into "**75% invite_only**" —
relabelling a degenerate value and moving it to the *maximum* of the scale. It
labels a **1,256-seat public mixer** invite-only. Maximum realizable effect is
about **+2 final points**; one interest tag is five times that.

Also corrected: the bulk-import prompt does not "fall through" to `capped`, it
*explicitly instructs* it — and since the LLM sees only pasted text and never
the listing page, `capped` is a correct expression of ignorance, not a bug.

**Found instead, and worth more:** `visibility:"private"` (6 of 40) correlates
perfectly with Luma publishing **no** JSON-LD at all. Those rows are stuck at
~150-char descriptions **permanently** — no re-scrape will fix them — while
description carries 0.8 of the ranking weight. Corpus-wide, **12 of 40** rows
are still under 200 chars.

## P4 — bulk-import review step: **SHIPPED, NARROWED TWICE**

The review queue was dropped for an insert-time guard. Then the guard's hostname
denylist was **also** reverted, after it removed **FIRSTMARK GUILDS SUMMIT** —
an invite-only C-suite event with the longest genuine description in the corpus —
because its RSVP is a Google Form, and a personal invite from Runway's CEO
because it is an X post. Where an event takes RSVPs says nothing about its
quality, and blocking on it penalises exactly the off-Luma invitations that tend
to be most exclusive.

What survived is the one structurally decidable case: a **calendar index** page
publishes `ItemList` + many Events, so every field read from it describes
whichever listing is first. `luma.com/jointhecollective` entered the corpus that
way and carried a date belonging to an unrelated event — verified drifting
(stored 2026-07-22; the first `start_at` on the page today is 2026-08-06). It is
now archived, and `extractJsonLdEvent` requires `@type === "Event"`.

Explicitly NOT rejecting on missing JSON-LD: 11 of 40 publish none and 6 of
those are legitimate private Luma events.

## P5 — quantify the description fix: still **BLOCKED** on deploy.

## P6 — learn from engagement: **stays rejected.** 3 clicks.

---

# The finding nobody proposed, which outranks all of the above

```
links with eventDate >= now:  1 / 40
```

The feed filters on `eventDate >= now`. **39 of 40 curated links are in the
past**, so production discovery currently ranks a single event. Every ranking
change in this plan is unmeasurable in production and will stay that way after
deploy.

**The binding constraint is inventory, not signal quality.** No proposal
addressed it, and none of them matter until it changes. The signal inspector now
shows this as the first thing on the page.

## Sequencing trap

`buildLinkDocument` includes `tags`, so any tag change invalidates all 40
vectors. Correct order is **deploy → settle tags → re-embed once**, not
re-embed first.

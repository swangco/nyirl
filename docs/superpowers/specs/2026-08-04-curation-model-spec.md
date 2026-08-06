# Turning Serena's curation logic into code

Date: 2026-08-04. Source: Serena's written description of how she built the
August list. Companion doc (plain language, for her): `docs/how-the-recommender-works.md`.

## Her stated algorithm, verbatim

1. Host first — is this T1 (Modal / Vercel / Sierra / Claude / Clay / OpenAI /
   top VCs hosting the best most exclusive events)?
2. Narrow by how "interesting" it is — atypical vs. a normal happy hour.
   Examples given: US Open private suite box, private Michelin star tasting,
   boxing class.
3. Stalk the host on Luma and Partiful; check X following, LinkedIn presence,
   past events hosted — i.e. clout.
4. 80% is noise. Anything open to the public is bad **unless** the host is cracked.
5. "I'm sourcing these lists to serve the consumer, not the host."

## The architectural read

**This is an intake filter, not a ranker.** Every criterion is a property of the
event, evaluated with no user in mind, and the output is a keep/discard decision
that throws away ~80% of candidates.

That is a different stage from the recommender, which takes the survivors and
personalises among them. Conflating the two is exactly the mistake that made the
old 0.6/0.4 blend rank *worse than keyword matching* (see the 2026-07-27 plan,
§6): quality signal was being asked to do a personalisation job it structurally
cannot do.

So her logic should be implemented as **a scoring gate at ingest**, feeding a
catalog that the existing 0.8/0.2 recommender then ranks. Do not raise the
quality weight in `scoreCuratedLink` to accommodate it — that reintroduces the
measured regression.

Corollary, confirmed on live data: because she pre-filters, the surviving corpus
has very low quality variance — 40 links produce only **8 distinct CQS values**,
with 10 tied at 78 and 10 tied at 43. A near-constant feature cannot rank. If
anything this argues the 0.2 weight is generous, not stingy.

## Gap analysis against the live corpus (40 curated links)

| Her criterion | What exists today | Verdict |
|---|---|---|
| Who is the host | **No host column.** `matchTierOneHost` substring-scans title+description for ~50 names | **Broken** |
| Host tier | Flat allowlist, all worth 35 pts | **Too coarse** |
| "Interesting" / atypical | Nothing. `format` enum is expo/mixer/workshop/hackathon/dinner | **Missing entirely** |
| Clout (X, LinkedIn, past events) | Nothing stored | **Missing entirely** |
| Open-to-public is bad | `exclusivity` enum exists but is 33/40 `capped` | **Non-discriminating** |

### Evidence

- **Host attribution is wrong, not just crude.** `FIRSTMARK GUILDS SUMMIT 2026`
  resolves to `key="anthropic"` — the write-up mentions Anthropic, so a mention
  earns the same 35 points as actually hosting. FirstMark is on the list too; the
  matcher simply returns whichever name it finds (longest wins on ties).
- **Recall is roughly 2× too permissive.** 19/40 links clear tier-1. Her stated
  bar ("80% are noise") implies ~8.
- **Two of her seven named T1 hosts are absent**: `clay` and `claude` (the list
  has `anthropic`, but Luma pages say "Claude").
- **The allowlist contains ordinary English words** — `primary`, `gamma`,
  `modal`, `sierra`, `runway` — so substring matching produces false hits. This
  is the same defect that got host-brand diversity reverted on 2026-07-28.

## Proposed implementation

### Stage 1 — record the host as data, not as a guess

Add to `curated_links`:

```
host_name        text        -- as written on the listing
host_handle      text        -- X / Luma handle, nullable
host_tier        text        -- 'tier_1' | 'tier_2' | 'unknown'
host_followers   integer     -- nullable, entered once
host_past_events integer     -- nullable, entered once
```

`matchTierOneHost` then reads `host_name` only, never the description. This
alone fixes the FirstMark→Anthropic class of error, and it kills the English-word
collisions because we stop scanning prose.

Keep the text scan as a *suggestion* in the add-link form — prefill `host_name`
from the title, let Serena correct it. Her correction is the training data.

### Stage 2 — tier the list instead of flattening it

Replace the single `TIER_ONE_HOSTS` array with an explicit map. Straw man,
**requires Serena's sign-off — do not ship invented tiers**:

```
tier_1 (35 pts): modal, vercel, sierra, claude/anthropic, clay, openai,
                 + named top VC firms
tier_2 (18 pts): solid-but-not-elite corporates and mid VCs
unknown (0 pts): everything else
```

### Stage 3 — score "interesting" with an LLM, cheaply and once

This is the only criterion that genuinely needs a language model, because it's a
judgement about *kind of experience*, not a lookup.

Her three examples share a structure worth naming: **the activity itself is the
draw, and it's something you couldn't easily arrange yourself** — a private suite,
a Michelin tasting, a boxing class — versus *a room with drinks in it*, where the
draw is only who else shows up.

Proposal: at ingest, one Haiku call per link returns a 0–3 novelty rating plus a
one-line justification, stored on the row. Runs once per link, never on the hot
path; at ~40 links/month this is a rounding error in cost. Justification is
stored so Serena can see *why* and correct it — corrections become few-shot
examples.

**This must be validated before it's trusted.** Have Serena rate ~40 links
herself, then check the model against her ratings. If it doesn't agree with her,
it doesn't ship. Same evidence bar as everything else.

### Stage 4 — implement the actual rejection rule

Her rule 4 is an interaction, not an additive term: `open AND NOT cracked_host`
→ reject. Additive scoring can't express it, which is why the current
`exclusivity` points don't reproduce her behaviour.

Also: `exclusivity` needs re-deriving, since 33/40 rows say `capped` and it
therefore carries almost no information. "Capped" appears to mean "Luma had a
headcount limit," which is nearly universal and not what she means.

### Stage 5 — measure it against her, not against intuition

The gate is only correct if it reproduces her decisions. The test: give her the
next batch of candidate links **before** she filters them, record her keep/discard
calls, then check what the gate would have done. Report agreement, plus the
disagreements in both directions — things she kept that we'd have cut are more
informative than the reverse.

## What is blocked on Serena

1. **The real tier list, in tiers** — names as written on Luma, split into
   tier 1 / tier 2, including which VC firms count.
2. **A statable rule for "interesting"** — is the "activity is the draw"
   formulation right, or is it something else?
3. **Where clout numbers come from** — manual entry at add-link time, or is it
   worth scraping? Manual is two boxes and turns her existing stalking into
   permanent data.

## Explicit non-goals

- Do **not** raise the quality weight in `scoreCuratedLink`. Measured regression.
- Do **not** auto-reject on the gate. Same reasoning as `flagExcludeRules`: for a
  product whose value is one person's judgement, surfacing a recommendation she
  can override beats silently discarding something she'd have kept.
- Do **not** re-introduce host-brand diversity until `host_name` exists. It was
  reverted specifically because the host had to be guessed from text.


---

# Addendum, 2026-08-05: what adversarial review did to this spec

Two design reviewers with live database access were run against the plan above
*before* any of it was built. Between them they rejected most of it, and the
central finding was that **the design sat on top of two scraper bugs**, so
nothing built on it could have worked.

## What shipped instead (commit `0be149d`)

1. **`extractMeta` was missing the `s` regex flag.** Luma's `og:description`
   contains literal newlines, so the pattern failed to match at all and the row
   stored NULL. Two of three live Luma pages were silently losing their whole
   description. Titles were unaffected because titles are single-line, which is
   why nobody noticed.
2. **`og:description` is a ~150-char SEO summary.** The full text is published
   as JSON-LD. Backfilled across the live corpus: **+39,753 characters, median
   +1,460 per row, average description 157 -> 1,214.** The link embedding carries
   80% of the ranking weight and was reading about a tenth of the page.
3. **Host is published as structured data** (`organizer`), resolving on 27 of 40
   links — so Stage 1's manual-entry plan was unnecessary work.
4. **`clay` and `claude` were missing** from the allowlist despite Serena naming
   both, and **"(N)YC" paid out Y Combinator's host score** via the tokens `n yc`.

## What was rejected, and why

- **The "interesting" rule** ("the activity is the draw and you couldn't arrange
  it yourself"). Hand-rated against the corpus, it **rejects 84% of what Serena
  actually kept** — 20 of 40 links are declared `mixer`, and she kept happy
  hours. Her own third example falsifies the second clause: anyone can book a
  boxing class. The reviewer's reformulation — *there is a thing you do together
  and it gives you a story afterwards* — fits far better, and belongs as a
  tie-breaker at the top of an already-host-filtered list, not as a second gate.
- **Validating novelty against her own ratings is unfalsifiable.** The corpus is
  so skewed that a model returning the constant `1` for every input scores 59%
  exactly and **95% within one point**. Any "the model agrees with Serena" result
  would be passed by a stub.
- **The keyword fallback**: 50% precision on live data. Best failure — the US
  Open "**suite**" keyword matching "VP and C-**Suite**" in the FirstMark summit.
  It also reintroduces the substring-collision class that got host-brand
  diversity reverted.
- **Host tier points, the unknown-host penalty, and clout columns.** The 18-point
  tier-2 figure had no derivation, and subdividing a signal already measured near
  random for ranking produces finer-grained noise. The unknown-host penalty turned
  out to encode *"is this link on luma.com"* — it would have demoted the FirstMark
  invite-only summit and the Runway CEO's personal invite.

## The two things that are genuinely blocked, restated

1. **There is no negative class anywhere.** Serena discards ~80% of what she
   sees and **not one rejected candidate is stored**. A filter's only job is to
   discard; it cannot be validated on a table containing only keeps. Persisting
   rejected candidates is the highest-value change available and needs no LLM.
2. **The 40 links are not a curated set.** 31 of them arrived in a single
   `addCuratedLinksBulk` paste with no review step — which is how a Google Form,
   an X profile, and a calendar index page got in. So the "19 of 40 clear tier-1
   vs her implied 8" calibration in §"Gap analysis" above **compares against a
   population it was never drawn from**, and should not be trusted in either
   direction.

Also worth recording: `exclusivity` is 33/40 `capped` not because Luma caps
headcount, but because the bulk-import LLM prompt falls through to `"capped"` as
its default. The claim in Stage 4 above is wrong.

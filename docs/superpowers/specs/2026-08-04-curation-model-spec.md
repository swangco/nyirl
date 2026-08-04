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

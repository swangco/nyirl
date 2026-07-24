# Discovery scoring redesign + Stage 0/1 recommendation system

Date: 2026-07-22

## The question this answers

Do we need CQS and a "fit" heuristic once we have semantic (vector) search? **Partly.**
A ranking score decomposes into two orthogonal things:

- **Relevance** — does this item match *this* user? Personalized, query-dependent.
- **Quality prior** — is this item good *regardless* of who's asking? Item-intrinsic.

Vector cosine similarity is a *relevance* function, and a far better one than substring
keyword matching. So **vector search replaces the fit heuristic.** But cosine says nothing
about quality: an invite-only YC founders' dinner and a random meetup can be equally close
to a user in embedding space. Quality (host prestige, exclusivity, format, locality,
intimacy) is exactly what CQS encodes, and it is *more* important with vector search, not
less — a pure-similarity ranking will happily float a perfectly-matched-but-mediocre event
above a slightly-less-matched-but-excellent one. This is why real rankers combine a match
score with a quality/authority prior (semantic relevance + PageRank, query match + review
score). **CQS stays and is the product's moat — it encodes Serena's taste.**

A third bucket — interest-tag and gender-orientation boosts — stays as explicit, additive,
capped, rule-based nudges. They are deliberately never fed into a learned model as raw
features (protected attributes) and never penalize non-disclosure.

## Architecture

```
score(user, item) = clamp( 0.6·relevance + 0.4·quality + boosts , 0, 100 )

  relevance = 100·cosine(profileEmbedding, itemEmbedding)   ← primary (vector)
              → falls back to improved keyword fit when either embedding is absent
  quality   = CQS  (host tier, exclusivity, format, locality, intimacy)   ← always available
  boosts    = interest-overlap (+) + gender-orientation (+)   ← rule-based, additive, capped
```

One `scoreCuratedLink()` replaces the four divergent call sites (homepage, category,
profile, digest). Hosted events keep the host-defined structural rubric and still pin on top.

## Key fixes folded in

1. **Double-count bug:** tier-1 host currently boosts *both* fit (+15) and CQS (+40).
   Host tier moves entirely into CQS (quality), removed from relevance.
2. **False-positive host matching:** substring match means `aws`⊂`flaws`, `yc`⊂`cycling`,
   ` yc ` never matches a leading "YC". Switch to word-boundary matching.
3. **Broken keyword normalization:** current fit divides hits by *total keywords in the
   type's list*, penalizing types with richer keyword lists. Switch to distinct-category
   hit counting.
4. **Profile-page divergence:** it showed `computeLinkFitScore` (fit-only) under a "fit"
   label while the homepage showed blended, and included *past* events. Unify + date-filter.

## Stage 0 — interaction logging (prerequisite for any learning)

- `interaction_events` table: `(id, userId?, itemKind, itemId, action, source, metadata, createdAt)`.
  Actions: `impression | click | apply | digest_open | digest_click`. Sources: `homepage |
  category | profile | digest`.
- `/api/out` route: logs a `click` then 302s to the target (outbound link tracking).
- Server-side impression logging when a ranked list renders.
- Digest links route through `/api/out?source=digest`.

## Stage 1 — pgvector semantic retrieval

- `CREATE EXTENSION vector`; `embedding vector(1536)` (nullable) on profiles, curated_links, events.
- OpenAI `text-embedding-3-small` via the AI SDK (`@ai-sdk/openai`, already a dependency).
- Embed on write (profile save, curated-link add); `scripts/backfill-embeddings.ts` for existing rows.
- Profile document includes the extracted resume text (currently only used in one Haiku call).
- Cosine computed in JS over upcoming candidates (41 rows today — trivial). SQL `<=>` + HNSW
  index is the Stage-2 path when the candidate set grows; noted, not built.
- **Graceful degradation:** no `OPENAI_API_KEY`, or a null embedding → relevance uses the
  improved keyword fit. Everything still ranks; embeddings sharpen it when present.

## Honest scope note

At 41 links / 2 profiles, neither embeddings nor a learned ranker will *visibly* beat good
heuristics — there is almost no data. The immediate win is (a) fixing genuinely broken
matching and (b) laying the pipeline + logging so the system can learn once data
accumulates. Activation of embeddings needs an `OPENAI_API_KEY` in Vercel env; until then
the app runs on the improved heuristics with zero regression.

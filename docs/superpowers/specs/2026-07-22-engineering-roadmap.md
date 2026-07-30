# NY IRL — Engineering Roadmap (top to bottom)

Date: 2026-07-22. Owner context: single-curator NYC events product (Serena), Next.js 16
App Router on Vercel, Drizzle + Neon Postgres (pgvector), NextAuth (Google), Resend digest.

## Product thesis (what the eng serves)

Encode Serena's taste into software and turn it into owned distribution: a signed-in,
profile-matched Discover feed of hand-curated NYC events, an apply flow for her own events,
and a selective weekly email. The moat is curation quality + personalization, so the eng
priorities are (1) the core loops actually close, (2) the data feeding matching is clean,
(3) it's safe to put in front of real users, and only then (4) it scales and learns.

## Where it stands (layers)

- **Data:** Neon Postgres, Drizzle push-only (no migration files), TS-only enums, pgvector
  enabled with `vector(1536)` columns + an `interaction_events` table (Stage 0).
- **Auth:** NextAuth v5, Google OAuth, DB sessions. Single hardcoded host (Serena's UUID in 4 files).
- **Matching:** unified `scoreCuratedLink()` = 0.6·semantic-or-keyword relevance + 0.4·CQS +
  additive boosts; registrant scoring = 0.6 structural rubric + 0.4 Haiku semantic.
- **Distribution:** homepage/category Discover, apply/host flow, weekly Resend digest (can't
  send yet — no keys), click/impression tracking via `/api/out` + `after()`.
- **Deploy:** Vercel (project `parlour`, team `serenas-projects`), one Neon DB shared by prod.

---

## Horizon A — Launch in a week (critical path)

The gate is "safe + the loops close + it can actually send." Ordered by blocking-ness.

### A1. Security & correctness hardening (do first — cheap, blocking)
- **Cron fail-open:** reject when `CRON_SECRET` is unset (currently accepts `Bearer undefined`).
- **Registration IDOR:** `updateRegistrationStatus` must verify the registration belongs to
  the event (not just that the caller hosts the event).
- **Unsubscribe:** stop the side-effect-on-GET (mail scanners auto-unsub) and the forge-any-
  userId (tokenless). Move the mutation to POST behind a confirmation, gated by an HMAC token.
- **Duplicate registrations / profile races:** unique constraint on `(eventId, userId)` +
  conflict-safe inserts; make `saveProfile` an atomic upsert.
- **Sign-in `?next=`:** honor the redirect the apply/category pages already emit (validated to
  a relative path), instead of always dumping users on `/profile`.
- **UTC date rendering:** event dates render in server (UTC) time across pages — pin to ET.

### A2. Close the loops (highest product leverage)
- **Applicant sees the decision:** apply page shows the registration status (under review /
  approved / waitlisted) instead of a dead end. *(the single biggest product gap)*
- **Host can create/edit events:** minimal create form + server action so the product isn't
  hand-administered via `scripts/`. Needs `ui-design-framework`; rubric (`criteriaWeights`)
  editing can start as a simple typed form over the known criteria.

### A3. Turn on distribution (unblock, config not code)
- Set `OPENAI_API_KEY` (activate embeddings → run `backfill:embeddings`), `RESEND_API_KEY` +
  verified sending domain, `CRON_SECRET` — all in Vercel env. Then a real digest dry-run.
- Restore a top-of-funnel: a public, signed-out browsable surface (even a read-only category
  peek) for SEO/sharing, and the Beehiiv CTA that was dropped in the rebrand.

### A4. Launch readiness
- Error monitoring (Sentry or Vercel Observability) so prod failures are visible.
- A seed/known-good dataset check; a smoke test of the five core flows.
- Basic rate limiting on `/api/out` and the auth/apply actions.

---

## Horizon B — Now / near-term quality (weeks 2–6)

- **Recommendation Stage 2:** nightly precompute of per-user top-N into a `recommendations`
  table (reuse the cron pattern); a small learned re-ranker (logistic/GBDT) trained offline on
  `interaction_events`, weights exported to JSON and scored in TS — no model-serving infra.
- **Calibrate scoring on real data:** replace the constant cosine→relevance mapping and the
  digest threshold with values learned from click-through; A/B the digest bar.
- **Multi-tenant readiness:** de-hardcode the single host — a `hosts` table (tier as data, not
  a source-code allowlist), host role on users, remove the 4 inlined UUIDs.
- **Data hygiene:** move `TIER_ONE_HOSTS` to a table; add `curated_links.source_url` uniqueness;
  re-scrape existing links to repair truncated titles; version migrations (stop push-only).
- **Post-event loop:** wire the dormant `connections` table + `attended` status into UI
  (check-in, "who you met," follow-ups) — closes the relationship loop that's the real value.
- **Observability of curation:** a Serena-facing dashboard — impressions/clicks per link,
  digest performance, which categories convert.

---

## Horizon C — True scaling (when it matters, not before)

- **Retrieval at scale:** HNSW index + SQL `<=>` top-K instead of JS cosine over all rows;
  select embedding columns only when needed (projection), not on every render.
- **Serving:** precomputed recs served from a table/cache; live-compute only for cold profiles.
- **Two-tower retrieval + neural ranker** only past ~100k interactions; a feature store only if
  a second product surface needs the same features. Dedicated vector store only if Neon+pgvector
  is genuinely outgrown (it won't be for a long time).
- **Write path:** impression logging via client beacon / sampling instead of per-render inserts;
  partition/rollup `interaction_events`; move heavy jobs off Vercel crons to a worker (Railway/
  Inngest) with retries and idempotency.
- **Cost & reliability:** batch embedding via the Batch API (50% off), prompt/embedding caching,
  Neon autoscaling, read replicas, budget alerts.

---

## Cross-cutting (all horizons)

- **Testing:** unit tests for the pure scoring functions (they're pure — cheap, high-value);
  integration tests for the actions; a Playwright smoke of the five flows. CI on GitHub Actions.
- **Migrations:** adopt `drizzle-kit generate` + checked-in SQL; stop diffing against prod.
- **Secrets/config:** app URL, thresholds, host list → env/DB, not source constants.
- **Privacy:** resumes/headshots are in *public* blob storage — move to authenticated access;
  keep protected attributes (gender/age) out of any learned model, as they are today.

## Execution order (recommended)

A1 → A2 (applicant loop) → A3 (keys + public surface) → A2 (event CRUD) → A4, then B, then C.
This session executes **A1 + the applicant-loop half of A2** (no new keys required); the rest is
planned above and staged for the next sessions.

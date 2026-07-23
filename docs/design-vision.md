# NY IRL — Design Vision

A living document capturing where NY IRL is headed and why, built through a PM-style discovery conversation on 2026-07-22. Update it as the vision sharpens — this isn't meant to be final.

## 1. Vision & problem

NY IRL is a **personal concierge for discovering NYC tech events** — not a general "anything happening in the city" app, and not, at its core, about who happens to be hosting a given event. The value is the matching: someone builds a profile once, and the algorithm (not a generic feed) tells them what's actually worth their time in the tech/founder/investor/builder scene.

That's a meaningfully specific positioning. It's not "Partiful for NYC" (social-first, host-first) and it's not a general events calendar (Luma/Eventbrite, comprehensive but unfiltered) — it's closer to "if you're the kind of person who'd want to go to a specific tech event, this finds it for you and tells you why."

## 2. Current state (as of 2026-07-22)

- **Discovery**: browse-by-category homepage + `/category/[category]` pages, gated personalization behind a completed profile (name, profile type, bio — gender/age/interests are optional extras that sharpen matching without gating it).
- **Scoring**: two systems — registrant scoring (structural rubric × 60% + AI semantic read × 40%) for people applying to Serena-hosted events, and discovery scoring (personal fit × 60% + Curation Quality Score × 40%) for everything else. Full writeup in `docs/session-recap.md`.
- **Curation**: single-curator right now (Serena manually adds tasteful events via the "Host" tool) — **this is intentional, not a gap**. The Host tab is explicitly a placeholder for a future multi-host submission system, not the permanent shape of the product.
- **Digest**: infrastructure built (Vercel Cron, Resend, quality-gated at score ≥ 80) but not yet proven — no real subscriber base, no Resend account connected yet. Not a near-term priority; see roadmap.
- **Visual design**: matches the "curated events" concept in spirit but doesn't yet read as sharp/premium — more on this below.

## 3. Dream state / north star

| Dimension | Where it's headed |
|---|---|
| **Audience** | Anyone who wants to go to a tech event in NYC specifically — algorithm-driven, not host-driven. The host is eventually invisible to the end experience. |
| **Core experience** | Two equally-weighted doors into the same thing: the live website (browse-first) and the weekly digest (email-first). Neither is the "real" product with the other as an afterthought. |
| **Curation model** | Phase 1 (now): Serena manually curates. Phase 2: other hosts submit their own events into the same system. The "Host" tab is the seed of that, not a permanent side feature. |
| **Success metric** | **Reach and reputation, not revenue.** Success looks like NY IRL becoming *the* recognized resource for curated NYC tech events — not a subscription business, not ad-supported, not optimized for monetization. |
| **Visual identity** | Sharp, premium, confident — the register of Luma or Vercel's own site: light background, high contrast, geometric sans type doing the work, generous whitespace, product content as the hero (not marketing fluff). Explicitly **not** a luxury-retail aesthetic (no brass/serif/boutique visual language) — that direction was tested and rejected in favor of "sharp tech done well" over "quiet luxury." Visible algorithmic scores (the "82 / fit" numbers) are a **feature**, not something to hide — they reinforce that this is a real matching engine, not just a nicely-formatted list. |

## 4. Gaps & tensions (and why they matter)

- **Visual polish, not visual direction.** The problem was never "this looks too tech" — the direction (sharp tech, Luma/Vercel-register) is correct and desired. What's off is that the current execution reads as generic/templated rather than sharp and premium. This is an execution gap (typography, spacing, confidence of the design system), not a strategic one. Concretely: needs a real pass on type scale, color contrast, and layout density with Luma and Vercel as direct reference points — not a repositioning.
- **Host-agnostic vision vs. single-host architecture** — surfaced as a possible tension early in this discussion, but resolved: the single-curator model is a deliberate phase-1 choice, not an accidental architectural trap. No action needed here beyond keeping the eventual multi-host path in mind when touching the Host tab so it doesn't get harder to open up later.
- **Digest exists in infrastructure only.** It's not a near-term gap because it's not a near-term priority (see roadmap) — but worth naming so nobody mistakes "the cron job runs" for "the digest is a real product yet."

## 5. Roadmap (in priority order)

1. **User onboarding push** (next 1-2 weeks): get real people building profiles and discovering events through the live site. This is the immediate goal — not more features, more real usage.
2. **Visual design pass**: rebuild the homepage and profile form's design system around the Luma/Vercel-inspired direction — light, high-contrast, confident type, tighter and more considered than the current execution. Scope: typography scale, color tokens, spacing/density, category tile and recommendation-card treatment.
3. **Digest maturation**: once there's a real subscriber base worth emailing, connect Resend for real, verify a sending domain, and start monitoring whether the quality bar (currently 80) is calibrated right against real send data.
4. **Multi-host submission system**: open up the Host tab so other curators can submit events into the same taxonomy/scoring system, moving toward the host-agnostic end state.

## Open questions (still to resolve)

- What does "onboarding a user" concretely look like — direct outreach, a signup push at an event, something else?
- Once the visual pass happens, does the Recommended-for-you card layout need to change shape too, or just its type/color treatment?
- At what subscriber count does the digest become worth turning on for real?

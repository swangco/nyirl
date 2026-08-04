# How NY IRL decides what to show someone

Written for Serena, August 2026. No engineering background assumed. If you drop
this whole file into Claude and ask it questions, it has everything it needs to
answer them.

---

## The one-sentence version

For every person, the site scores every upcoming event out of 100, and shows
them the highest scores first. That score is built from two ingredients mixed
together: **how well the event matches you personally** (80% of the score) and
**how good the event is in general** (20% of the score).

Everything else in this document is detail about those two ingredients, plus an
honest account of what the system currently can't do.

---

## Ingredient one: "does this match you?" (80% of the score)

### The problem this solves

We need the computer to notice that a robotics engineer who writes "I care about
hardware and manufacturing" should be shown a hardware founders dinner, and
should not be shown a marketing growth workshop. The hard part is that those two
pieces of text may not share a single word. "Hardware" doesn't appear in the
event description; the description says "physical products," "supply chain,"
"factory floor."

Word-matching can't see that. So we use something else.

### What an embedding is

Take any piece of text and hand it to an AI model. The model hands back a list
of 1,536 numbers. Think of those numbers as **coordinates on a very detailed map
of meaning**. Text about similar things lands in the same neighbourhood of the
map, even when the actual words are completely different.

So "hardware and manufacturing" and "physical products, supply chain" end up as
near-neighbours, while "growth marketing funnels" ends up far away.

We compute these coordinates twice:

- **For each person**, from their name, job title, company, the type of person
  they say they are, their bio, and their interests.
- **For each event**, from its title, description, category, format, how
  exclusive it is, whether it's in NYC, and its tags.

Then "does this match you" is simply: **how close are those two points on the
map?** Closer means a better match.

### One thing we deliberately leave out

A person's uploaded résumé is **not** included in their coordinates, and this was
a deliberate decision backed by measurement, not a guess.

We tested it both ways. Including the résumé made recommendations measurably
*worse*. The reason is worth understanding, because it's a bit counterintuitive:
**a résumé is a record of your past, and what you want to attend next is usually
not more of your past.** A backend engineer with ten years in payments may be
trying to move into AI. Her résumé is 90% payments, so it drags her coordinates
toward payments events and away from where she actually wants to go.

We also tried trimming the résumé short instead of removing it. That didn't help
either, which told us length was never the problem — relevance was.

The résumé is still used, just somewhere else: when **you** are reviewing
applications to your own events, the system reads the applicant's résumé
directly to help you judge them.

---

## Ingredient two: "is this a good event?" (20% of the score)

This is called the **Curation Quality Score**. It's your taste, written down as
arithmetic. Every event gets 0–100 points from five things:

| What it measures | Points available |
|---|---|
| Is the host on our "tier 1" list? | 35 |
| How exclusive is it? (open 5 / capped 15 / invite-only 25) | 25 |
| What format? (expo 5, mixer 10, workshop 12, hackathon 12, dinner 15) | 15 |
| Is it in NYC? (yes 10 / out of town 0) | 10 |
| How small is the room? (under 50 people 15, under 150 8, bigger 0) | 15 |

The important thing about this ingredient: **it gives every person the same
answer.** An invite-only Modal dinner scores the same for you, for me, and for a
stranger. It says nothing about who you are.

### Why it's only 20%, and why that's not a criticism of your taste

This used to be **40%**, and we changed it because we measured it and found it
was actively hurting.

Here's the test. We built a fake but realistic world — 50 people and 200 events,
written independently so no answer was baked in — and had AI judges (who never
saw any of our scoring) mark, for each person, which 10 events were genuinely
right for them and which 8 were flat-out wrong. That became the answer key.

Then we scored the same events different ways and checked them against that key:

| How we ranked | Score |
|---|---|
| Shuffling completely at random | 4.0 |
| Quality Score alone, ignoring the person | **4.8** |
| Simple word-matching alone | 28.4 |
| **The old recipe (60% match / 40% quality)** | **27.2** |
| **The new recipe (80% match / 20% quality)** | **41.2** |

Read the second row carefully. Ranking by quality alone was **barely better than
random** at picking what a *particular person* wants. That's not because the
Quality Score is wrong about quality — it's right about quality. It's because
it's the *same for everyone*, so it contains no information about who's asking.

And look at rows three and four. The old recipe scored **worse than plain
word-matching**, because that 40% of dead weight was dragging everything else
down. Turning it down to 20% improved results by 51%.

**None of this says your taste is wrong.** It says your taste answers a different
question. More on that below, because it's the most important thing in this
document.

---

## The thing that matters most: filtering vs. ranking

When you describe how you build a list, you're describing this:

1. Who's the host, and are they tier 1?
2. Is this interesting and atypical, or is it another happy hour?
3. What's the host's actual clout — followers, past events, presence?
4. 80% is noise. Anything open to the public is bad unless the host is cracked.

Every one of those is a **filter**. You're answering: *does this event deserve to
exist on my list at all?* You're throwing away four out of five things you look
at.

The recommender answers a completely different question: *given the events that
already survived Serena's filter, which ones should this particular person see
first?*

These are two separate stages, and they need two separate kinds of signal:

- **Your stage** is about the event. Quality is the whole game. Personalization
  would be wrong here — an event isn't worth listing just because one user
  happens to match it.
- **The recommender's stage** is about the person. Quality can barely help,
  *because everything that got this far is already good.* You already removed the
  bad ones.

This resolves what looks like a contradiction. Your instinct is right, the
measurement is right, and they're about different steps.

It also explains something we found in the live data. Across the 40 events
currently in the system there are only **8 different quality scores** — ten
events tie at exactly 78, ten more tie at 43. Once you've filtered out the junk,
the survivors all look similar on quality, so quality can't separate them. It has
already done its job by then.

---

## What the system genuinely cannot do yet

This is the honest part, and it's where your notes are most valuable.

### 1. We don't actually know who's hosting anything

There is **no field in the database for the host.** Your first and most important
question — "who's hosting?" — is the one piece of information we never recorded.

What the code does instead is scan the event's title and description for company
names from a hardcoded list of about 50, and if it finds one, award 35 points.

That misfires exactly how you'd expect. In the live data right now, the event
**"FIRSTMARK GUILDS SUMMIT 2026"** is credited to **Anthropic** — because the
word "Anthropic" appears somewhere in the write-up. FirstMark is the actual host,
and FirstMark is *also* on the list; the code just grabbed whichever name it
happened to find. An event that merely *mentions* a great company gets the same
35 points as an event that great company is actually throwing.

### 2. The tier list is flat, and it doesn't match yours

Every name on the list is worth the same 35 points. So a Modal dinner and a
Microsoft expo score identically on host.

Also, of the seven names you led with — Modal, Vercel, Sierra, Claude, Clay,
OpenAI, top VCs — **Clay isn't on the list at all**, and "Claude" isn't either
(Anthropic is, but nobody writes "Anthropic" on a Luma page; they write "Claude").

And the list is far too generous: **19 of the 40 live events** currently clear the
tier-1 bar. You say 80% is noise, which would mean roughly 8 survive. We're
letting through more than twice what you would.

### 3. We have nothing at all for "interesting"

This is your second criterion and we have **zero** signal for it. A US Open
private suite, a Michelin tasting menu, a boxing class — versus another rooftop
happy hour. The system can't tell these apart.

The closest thing we have is a "format" label with five options: expo, mixer,
workshop, hackathon, dinner. But "dinner" covers both a Michelin tasting and
pizza in an office. The distinction you actually care about isn't in there.

### 4. We have no clout data

Following counts, LinkedIn presence, how many events someone has hosted before —
none of it is stored. You get this by stalking Luma, Partiful and X. The system
has no equivalent.

### 5. The "open to public is bad" rule can't fire

You said: anything open to the public is bad unless the host is cracked. There is
an exclusivity field meant to capture this, but in the live data **33 of the 40
events are labelled "capped"**, with only 4 invite-only and 3 open. Nearly
everything has the same value, so the field can't distinguish anything. "Capped"
just means Luma had a headcount limit, which is almost always true.

---

## What we'd need from you to fix this

Three things, roughly in order of how much they'd improve results:

1. **Your real tier list, in tiers.** Not one list — two or three. Which hosts are
   genuinely top (Modal, Vercel, Sierra, Claude, Clay, OpenAI…), which are solid
   but not elite, and which specific VC firms count. Names as they'd actually be
   written on a Luma page.

2. **What "interesting" means, in a way that can be checked.** You gave three
   great examples (US Open suite, Michelin dinner, boxing class). What's the
   underlying rule? Best guess from your examples: *the activity itself is the
   draw and you couldn't easily get it yourself* — versus a room with drinks in
   it. If we can state that rule, an AI can apply it to each listing and score it,
   the same way you would.

3. **Where the clout number comes from.** If you're checking X followers and past
   events anyway, we could add two boxes when you add a link and you fill them in
   once. That turns your stalking into permanent data instead of a judgement that
   evaporates.

---

## Some things worth knowing

- **Your own events always pin to the top** of the list and don't get a
  competitive score. They're your track record, not third-party curation.
- **All of this is cheap.** Computing the coordinates for a person or an event
  costs about five one-thousandths of a cent. Even at a hundred thousand users
  it's a couple of dollars, one time. The expensive thing was never the AI.
- **Nothing is ever thrown away for demographic reasons.** Gender, age and
  interests can only ever *add* points, never subtract.
- **The system degrades safely.** If the AI is unavailable, it silently falls
  back to word-matching instead of breaking.

## Where the code lives

- `src/lib/scoring.ts` — all the scoring maths, including the tier-1 host list
- `src/lib/embeddings.ts` — turning text into coordinates
- `src/lib/cohort.ts` — room caps and applicant screening for your own events
- `scripts/eval/run.ts` — the measurement harness that produced the table above
- `docs/superpowers/specs/2026-07-27-recommender-plan.md` — the full engineering
  write-up, much more technical than this

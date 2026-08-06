import type { events, profiles, registrations } from "@/db/schema";

/**
 * Room composition and hard-filter flags for the host's applicant review.
 *
 * `events.typeCaps` and `events.excludeRules` have been in the schema, and have
 * real host-authored values on the live event, while being read by no code at
 * all. This module activates them.
 *
 * Design notes, each of which exists because the obvious version is broken:
 *
 *  - Caps are resolved to ABSOLUTE SEAT COUNTS, not applied as live shares.
 *    A share cap discretizes badly at the capacities this product actually uses:
 *    0.15 x 6 seats = 0.9, which floors to 0 and silently turns "about one
 *    investor" into "no investors at all". Seats are rounded, and any cap the
 *    host wrote at all is guaranteed at least one seat.
 *
 *  - Caps require a CAPACITY. A share is meaningless without a denominator, so
 *    an event with no capacity enforces no caps at all rather than binding
 *    against the live applicant count, which would move under the host's feet.
 *
 *  - A cap is a CEILING and it HOLDS. An earlier design filled leftover seats
 *    ignoring caps so as never to waste capacity; that cancels the constraint
 *    exactly when it binds (25 investors for 16 seats would end up 11 investors
 *    against a 15% cap). Unused seats are reported instead of quietly reassigned,
 *    because "your cap left 4 seats empty" is information the host should act on.
 *
 *  - Primary type is resolved against the CAP vocabulary first. profileType is
 *    multi-select, so a share is otherwise undefined, and resolving against the
 *    event's target_types instead lets an applicant evade a cap by ticking a
 *    second box — on the live event the capped type ("investor") does not appear
 *    in the criteria lists at all, so that resolution order would never bind.
 *
 *  - Exclude rules only ever FLAG. For a product whose value is one person's
 *    judgment, silently auto-declining a good applicant is a far worse failure
 *    than showing the host a flag they dismiss.
 */

type Profile = typeof profiles.$inferSelect;
type Event = typeof events.$inferSelect;
type Registration = typeof registrations.$inferSelect;

export type TypeCaps = Record<string, number>;

export function parseTypeCaps(json: string | null): TypeCaps | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    const out: TypeCaps = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && v >= 0 && v <= 1) out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

export function parseExcludeRules(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Which single type an applicant counts against for capacity purposes.
 * Resolved against the capped types first (that is the vocabulary the cap is
 * expressed in), so ticking extra boxes can't dodge a cap. Falls back to the
 * first non-"other" declared type.
 */
export function resolvePrimaryType(
  profileType: string[] | null,
  caps: TypeCaps | null,
): string {
  const types = profileType ?? [];
  if (caps) {
    // MOST BINDING cap wins, not the first key in the JSON. Iterating insertion
    // order made the answer depend on the byte order the host happened to type
    // type_caps in: {"founder":1.0,"investor":0.15} and {"investor":0.15,
    // "founder":1.0} gave different answers for the same person, and on the
    // live event an investor+operator applicant always burned an investor seat
    // purely because "investor" was written first.
    const capped = types
      .filter((t) => t in caps)
      .sort((a, b) => caps[a]! - caps[b]! || a.localeCompare(b));
    if (capped.length) return capped[0]!;
  }
  return types.find((t) => t !== "other") ?? types[0] ?? "other";
}

/** Absolute seat allowance for a capped type. Any NON-ZERO cap gets at least
 * one seat — such a cap means "few", never "none" — but an explicit 0 means
 * exactly that, so it must not be rounded up into an admission. */
export function seatsForCap(share: number, capacity: number): number {
  if (share <= 0) return 0;
  return Math.max(1, Math.round(share * capacity));
}

export type CohortInput = {
  registrationId: string;
  primaryType: string;
  score: number;
  /** Decisions already made. `declined` frees the seat; `approved`/`attended`
   * hold theirs regardless of score, because the host already said yes. */
  status?: string;
};

const LOCKED_IN = new Set(["approved", "attended"]);
const RELEASED = new Set(["declined"]);

export type CohortResult = {
  admit: string[];
  /** Held back purely because their type was already full. */
  cappedOut: string[];
  /** Held back because the room is full. */
  overflow: string[];
  /** Seats a cap prevented us from filling — surfaced, never silently reused. */
  unusedSeats: number;
  byType: Record<string, { admitted: number; seats: number | null }>;
};

/**
 * Greedy selection by score, subject to per-type ceilings. Deterministic:
 * equal scores fall back to registrationId so two runs never disagree.
 */
export function selectCohort(
  applicants: CohortInput[],
  opts: { capacity: number | null; caps: TypeCaps | null },
): CohortResult {
  // Declined applicants release their seat; without this, declining the two
  // highest-scoring investors would permanently badge every later investor
  // "capped out" for seats nobody occupies.
  const live = applicants.filter((a) => !RELEASED.has(a.status ?? ""));
  const capacity = opts.capacity ?? live.length;

  // A share cap needs a denominator. With no capacity there isn't one, and
  // using the applicant count makes the cap bind against a room that has no
  // seat limit — 8 of 10 applicants told they are "capped out" of an unlimited
  // room, and a "/ N cap" chip that moves every time someone applies.
  const seats: Record<string, number> = {};
  if (opts.caps && opts.capacity != null) {
    for (const [type, share] of Object.entries(opts.caps)) {
      seats[type] = seatsForCap(share, opts.capacity);
    }
  }

  // Already-approved people keep their seat regardless of rank; only undecided
  // applicants compete for what's left.
  const byRank = (a: CohortInput, b: CohortInput) =>
    b.score - a.score || a.registrationId.localeCompare(b.registrationId);
  const locked = live.filter((a) => LOCKED_IN.has(a.status ?? "")).sort(byRank);
  const contending = live.filter((a) => !LOCKED_IN.has(a.status ?? "")).sort(byRank);

  const admit: string[] = [];
  const cappedOut: string[] = [];
  const overflow: string[] = [];
  const admittedByType: Record<string, number> = {};

  for (const a of locked) {
    admit.push(a.registrationId);
    admittedByType[a.primaryType] = (admittedByType[a.primaryType] ?? 0) + 1;
  }

  for (const a of contending) {
    if (admit.length >= capacity) {
      overflow.push(a.registrationId);
      continue;
    }
    const limit = seats[a.primaryType];
    const taken = admittedByType[a.primaryType] ?? 0;
    if (limit !== undefined && taken >= limit) {
      cappedOut.push(a.registrationId);
      continue;
    }
    admit.push(a.registrationId);
    admittedByType[a.primaryType] = taken + 1;
  }

  const byType: CohortResult["byType"] = {};
  for (const t of new Set([...Object.keys(admittedByType), ...Object.keys(seats)])) {
    byType[t] = { admitted: admittedByType[t] ?? 0, seats: seats[t] ?? null };
  }

  return {
    admit,
    cappedOut,
    overflow,
    unusedSeats: Math.max(0, capacity - admit.length),
    byType,
  };
}

/**
 * Counts each applicant ONCE, by their own DECLARED primary type. The host
 * dashboard previously incremented a counter per selected profileType, so a
 * single applicant who ticked five boxes added one to five different tallies —
 * the room summary the host reads was arithmetically wrong.
 *
 * Deliberately does NOT resolve against the caps. "Which bucket does this person
 * spend a seat from" and "what is this room made of" are different questions,
 * and answering the second with the first mislabels people: on the live event a
 * founder who also ticked "operator" was reported as "1 operator, 0 founders"
 * purely because operator happened to be the capped type. Cap consumption is
 * reported separately, by `selectCohort`'s `byType`.
 */
export function composition(
  applicants: { profileType: string[] | null }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of applicants) {
    const t = resolvePrimaryType(a.profileType, null);
    out[t] = (out[t] ?? 0) + 1;
  }
  return out;
}

/**
 * Deterministic, no-LLM detection of the exclusion patterns a host can express.
 * Returns the rules that appear to be hit, with the evidence that triggered
 * them, so the host sees WHY rather than an opaque badge. Never decides.
 */
/**
 * `scope` is the whole design. Matching role words anywhere in a profile is
 * what produces the false positives that make a flag worthless:
 *
 *   "We're recruiting our founding engineer"      -> flagged as a recruiter
 *   "Building an AI copilot for sales teams"      -> flagged as a sales pitch
 *   "seeking a technical co-founder and seed investors"
 *                                                 -> flagged as not building
 *
 * All three are the target audience, not the excluded audience. What separates
 * a recruiter from a founder who recruits is that the recruiter's JOB TITLE says
 * so — so role rules read title/company only. Only genuinely self-declared
 * intent ("open to work") is allowed to match free-text bio.
 */
const RULE_SIGNALS: { match: RegExp; test: RegExp; scope: "role" | "any" }[] = [
  {
    match: /recruit|talent|staffing|headhunt/i,
    test: /\b(recruiter|recruiting (manager|lead|partner)|talent acquisition|talent partner|staffing|headhunter|sourcer)\b/i,
    scope: "role",
  },
  {
    match: /sales|pitch|service|vendor|agency/i,
    test: /\b(account executive|sales (rep|representative|manager|director|lead)|vp,? of sales|head of sales|business development (rep|manager|director)|bizdev|sdr|bdr)\b/i,
    scope: "role",
  },
  {
    // Only an explicit, self-declared job search counts. The ABSENCE of a
    // founder tag is not evidence of anything — the live event's own typeCaps
    // reserve seats for investors and operators, so flagging every non-founder
    // put the caps UI and the flag UI in direct contradiction on one screen.
    match: /not currently building|building a company|founder/i,
    test: /\b(open to work|#opentowork|looking for (a|my next) role|seeking (a|my) (new )?(role|position|job)|job.?seeking|recently laid off|between roles)\b/i,
    scope: "any",
  },
];

export function flagExcludeRules(
  profile: Pick<Profile, "title" | "company" | "bioBlurb" | "profileType"> | null,
  rules: string[],
): { rule: string; evidence: string }[] {
  if (!profile || rules.length === 0) return [];
  const role = [profile.title, profile.company].filter(Boolean).join(" · ");
  const all = [profile.title, profile.company, profile.bioBlurb].filter(Boolean).join(" · ");
  const jobSeeking = (profile.profileType ?? []).includes("job_seeking");
  const hits: { rule: string; evidence: string }[] = [];

  for (const rule of rules) {
    for (const signal of RULE_SIGNALS) {
      if (!signal.match.test(rule)) continue;
      const m = (signal.scope === "role" ? role : all).match(signal.test);
      if (m) {
        hits.push({ rule, evidence: m[0] });
        break;
      }
      // Self-declared on the profile itself, which is not free text and so
      // carries no ambiguity.
      if (signal.scope === "any" && jobSeeking) {
        hits.push({ rule, evidence: "profile is marked job seeking" });
        break;
      }
    }
  }
  return hits;
}

/**
 * Convenience wrapper for a host dashboard row.
 *
 * `scoreOf` exists because the stored `compositeScore` is an audit trail of what
 * the host saw at apply time, not the current score. The dashboard renders the
 * recomputed score, so selection must run on the SAME number the host is looking
 * at — otherwise a row can read 78 while being capped out behind a row reading
 * 64, and the "would admit" pill silently contradicts the numbers beside it.
 */
export function reviewApplicants(
  event: Pick<Event, "capacity" | "typeCaps" | "excludeRules">,
  rows: { registration: Registration; profile: Profile | null }[],
  scoreOf: (row: { registration: Registration; profile: Profile | null }) => number = (r) =>
    r.registration.compositeScore ?? 0,
) {
  const caps = parseTypeCaps(event.typeCaps);
  const rules = parseExcludeRules(event.excludeRules);
  const cohort = selectCohort(
    rows.map((r) => ({
      registrationId: r.registration.id,
      primaryType: resolvePrimaryType(r.profile?.profileType ?? null, caps),
      score: scoreOf(r),
      status: r.registration.status,
    })),
    { capacity: event.capacity, caps },
  );
  const admitSet = new Set(cohort.admit);
  const cappedSet = new Set(cohort.cappedOut);
  return {
    cohort,
    caps,
    perApplicant: new Map(
      rows.map((r) => [
        r.registration.id,
        {
          wouldAdmit: admitSet.has(r.registration.id),
          cappedOut: cappedSet.has(r.registration.id),
          flags: flagExcludeRules(r.profile, rules),
        },
      ]),
    ),
  };
}

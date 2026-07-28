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
    for (const capped of Object.keys(caps)) {
      if (types.includes(capped)) return capped;
    }
  }
  return types.find((t) => t !== "other") ?? types[0] ?? "other";
}

/** Absolute seat allowance for a capped type. Any cap the host wrote gets at
 * least one seat — a cap means "few", never "none". */
export function seatsForCap(share: number, capacity: number): number {
  return Math.max(1, Math.round(share * capacity));
}

export type CohortInput = {
  registrationId: string;
  primaryType: string;
  score: number;
};

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
  const capacity = opts.capacity ?? applicants.length;
  const ranked = [...applicants].sort(
    (a, b) => b.score - a.score || a.registrationId.localeCompare(b.registrationId),
  );

  const seats: Record<string, number> = {};
  if (opts.caps) {
    for (const [type, share] of Object.entries(opts.caps)) {
      seats[type] = seatsForCap(share, capacity);
    }
  }

  const admit: string[] = [];
  const cappedOut: string[] = [];
  const overflow: string[] = [];
  const admittedByType: Record<string, number> = {};

  for (const a of ranked) {
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
 * Counts each applicant ONCE, by primary type. The host dashboard previously
 * incremented a counter per selected profileType, so a single applicant who
 * ticked five boxes added one to five different tallies — the room summary the
 * host reads was arithmetically wrong.
 */
export function composition(
  applicants: { profileType: string[] | null }[],
  caps: TypeCaps | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of applicants) {
    const t = resolvePrimaryType(a.profileType, caps);
    out[t] = (out[t] ?? 0) + 1;
  }
  return out;
}

/**
 * Deterministic, no-LLM detection of the exclusion patterns a host can express.
 * Returns the rules that appear to be hit, with the evidence that triggered
 * them, so the host sees WHY rather than an opaque badge. Never decides.
 */
const RULE_SIGNALS: { match: RegExp; test: RegExp }[] = [
  { match: /recruit|talent|staffing|headhunt/i, test: /recruit|talent acquisition|staffing|headhunter|sourcer/i },
  { match: /sales|pitch|service|vendor|agency/i, test: /account executive|sales|business development|bizdev|agency|consultanc|freelance/i },
  { match: /not currently building|building a company|founder/i, test: /open to work|seeking|looking for a role|job seeking/i },
];

export function flagExcludeRules(
  profile: Pick<Profile, "title" | "company" | "bioBlurb" | "profileType"> | null,
  rules: string[],
): { rule: string; evidence: string }[] {
  if (!profile || rules.length === 0) return [];
  const haystack = [profile.title, profile.company, profile.bioBlurb]
    .filter(Boolean)
    .join(" · ");
  const hits: { rule: string; evidence: string }[] = [];

  for (const rule of rules) {
    for (const signal of RULE_SIGNALS) {
      if (!signal.match.test(rule)) continue;
      const m = haystack.match(signal.test);
      if (m) {
        hits.push({ rule, evidence: m[0] });
        break;
      }
      // The "not currently building a company" rule is also satisfied
      // structurally: no founder type declared.
      if (/not currently building/i.test(rule) && !(profile.profileType ?? []).includes("founder")) {
        hits.push({ rule, evidence: "profile does not list founder" });
        break;
      }
    }
  }
  return hits;
}

/** Convenience wrapper for a host dashboard row. */
export function reviewApplicants(
  event: Pick<Event, "capacity" | "typeCaps" | "excludeRules">,
  rows: { registration: Registration; profile: Profile | null }[],
) {
  const caps = parseTypeCaps(event.typeCaps);
  const rules = parseExcludeRules(event.excludeRules);
  const cohort = selectCohort(
    rows.map((r) => ({
      registrationId: r.registration.id,
      primaryType: resolvePrimaryType(r.profile?.profileType ?? null, caps),
      score: r.registration.compositeScore ?? 0,
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

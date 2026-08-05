import { EMBEDDING_DIM } from "@/lib/embeddings";
import type { curatedLinks, profiles } from "@/db/schema";

type Profile = typeof profiles.$inferSelect;
type CuratedLink = typeof curatedLinks.$inferSelect;

/**
 * A deterministic, in-memory cast of people and events for exercising the
 * signal inspector across its whole range.
 *
 * Why synthetic rather than seeding the database: this is Serena's live product.
 * Inserting fake founders and fake events to test a UI would put them in her
 * feed, her digest, and her impression logs. Nothing here is ever persisted.
 *
 * Why constructed vectors rather than real embeddings: the OpenAI key is
 * Sensitive in Vercel and unavailable locally, but more importantly a real
 * embedding gives you whatever similarity it gives you. To prove the UI reads
 * correctly at relevance 8 and at relevance 95 you need to *choose* the
 * similarity, not hope for it. `vectorPair` produces two unit vectors whose
 * cosine is exactly the number asked for, so the spread is guaranteed and the
 * same on every run.
 */

/**
 * Two unit vectors with cosine similarity exactly `c`.
 *
 * Built on an orthonormal pair (e1, e2): a = e1, b = c·e1 + √(1−c²)·e2.
 * Then a·b = c, and both have length 1, so cosine(a, b) = c exactly.
 */
export function vectorPair(c: number, dim = EMBEDDING_DIM): [number[], number[]] {
  const a = new Array(dim).fill(0);
  const b = new Array(dim).fill(0);
  a[0] = 1;
  b[0] = c;
  b[1] = Math.sqrt(Math.max(0, 1 - c * c));
  return [a, b];
}

export type SandboxPerson = {
  id: string;
  label: string;
  /** What this case is meant to prove. */
  note: string;
  profile: Profile;
};

export type SandboxEvent = {
  id: string;
  label: string;
  note: string;
  link: CuratedLink;
  /** Cosine this event is pinned to, per person id. */
  cosineByPerson: Record<string, number>;
};

function baseProfile(over: Partial<Profile>): Profile {
  return {
    id: "sandbox", userId: "sandbox", fullName: "", title: null, company: null,
    profileType: [], bioBlurb: null, interests: [], tags: null, genderIdentity: null,
    embedding: null, embeddingDocument: null,
    ...over,
  } as Profile;
}

function baseLink(over: Partial<CuratedLink>): CuratedLink {
  return {
    id: "sandbox", addedBy: "sandbox", sourceUrl: "https://example.com",
    title: null, description: null, imageUrl: null, category: "founders",
    eventDate: null, exclusivity: "capped", format: "mixer", outOfTown: false,
    tags: null, hostNames: null, embedding: null, embeddingDocument: null,
    createdAt: new Date(0),
    ...over,
  } as CuratedLink;
}

/** People spanning sparse-to-rich profiles and different domains. */
export const SANDBOX_PEOPLE: SandboxPerson[] = [
  {
    id: "p_robotics",
    label: "Maya · robotics founder",
    note: "Rich profile, clear domain. Should match hardware events strongly.",
    profile: baseProfile({
      fullName: "Maya Okonkwo", title: "Co-founder & CEO", company: "Tessellate Robotics",
      profileType: ["founder"], interests: ["boxing", "running"],
      bioBlurb: "Building warehouse robotics. Previously mechanical engineering at a self-driving company. Interested in hardware manufacturing, supply chain and factory automation.",
    }),
  },
  {
    id: "p_investor",
    label: "Daniel · seed investor",
    note: "Investor. Tests that quality and host tier read sensibly.",
    profile: baseProfile({
      fullName: "Daniel Reyes", title: "Partner", company: "Northwater Capital",
      profileType: ["investor"], interests: ["wine", "tennis"],
      bioBlurb: "Seed investor in developer tools and AI infrastructure. Write first cheques.",
    }),
  },
  {
    id: "p_sparse",
    label: "Tomás · sparse profile",
    note: "Almost no text. The known weak case — proves the UI shows WHY it's weak.",
    profile: baseProfile({
      fullName: "Tomás Lira", title: "Engineer", company: null,
      profileType: ["engineer"], interests: [], bioBlurb: "Engineer.",
    }),
  },
  {
    id: "p_novector",
    label: "Priya · no embedding yet",
    note: "Profile never embedded. Forces the keyword fallback path.",
    profile: baseProfile({
      fullName: "Priya Nandi", title: "Head of Design", company: "Kettle",
      profileType: ["other"], interests: ["art"],
      bioBlurb: "Design lead working on design systems and typography for developer products.",
    }),
  },
];

/**
 * Events spanning the quality range — "crackedness" varied deliberately across
 * host tier, exclusivity, format, locality and room size, so every component of
 * the quality ledger is exercised at both ends.
 */
export const SANDBOX_EVENTS: SandboxEvent[] = [
  {
    id: "e_top",
    label: "Peak: declared tier-1 host, invite only, intimate dinner",
    note: "Everything maxed. Quality should be at or near 100.",
    link: baseLink({
      title: "Dinner with Modal", hostNames: ["Modal"], exclusivity: "invite_only",
      format: "dinner", outOfTown: false, tags: ["ai"],
      description: "An intimate dinner for 24 people building AI infrastructure, hardware and developer tools. Manufacturing, supply chain and systems engineering welcome.",
    }),
    cosineByPerson: { p_robotics: 0.52, p_investor: 0.41, p_sparse: 0.22, p_novector: 0.19 },
  },
  {
    id: "e_mention",
    label: "Trap: mentions a tier-1 name but does not host",
    note: "Proves the host provenance chip distinguishes declared from guessed.",
    link: baseLink({
      title: "Double Diamond Demo Night ft. Cursor, Vercel, and friends",
      hostNames: ["Double Diamond"], exclusivity: "capped", format: "mixer",
      description: "A demo night featuring builders from Cursor and Vercel showing what they've shipped.",
    }),
    cosineByPerson: { p_robotics: 0.31, p_investor: 0.36, p_sparse: 0.20, p_novector: 0.24 },
  },
  {
    id: "e_open",
    label: "Floor: open to public, expo, out of town, huge",
    note: "Everything minimised. Quality should be near the bottom.",
    link: baseLink({
      title: "Regional HVAC & Plumbing Trade Expo",
      hostNames: ["Metro Expo Group"], exclusivity: "open", format: "expo",
      outOfTown: true,
      description: "Over 4000 attendees. Trade show floor for heating, ventilation and plumbing suppliers.",
    }),
    cosineByPerson: { p_robotics: 0.09, p_investor: 0.07, p_sparse: 0.12, p_novector: 0.08 },
  },
  {
    id: "e_interest",
    label: "Boost: shared interest tag",
    note: "Only case where a boost fires. Proves boosts are itemised.",
    link: baseLink({
      title: "Founder Strength Club — private session at Tone House",
      hostNames: ["Andrew's Yeung's Tech Events"], exclusivity: "invite_only",
      format: "workshop", tags: ["boxing", "founders"],
      description: "A private strength session for 24 early-stage founders and CEOs.",
    }),
    cosineByPerson: { p_robotics: 0.38, p_investor: 0.26, p_sparse: 0.21, p_novector: 0.17 },
  },
  {
    id: "e_nohost",
    label: "Unknown host, mid everything",
    note: "The commonest real shape — nothing published, average on all axes.",
    link: baseLink({
      title: "Agentic Commerce in iMessage", hostNames: [],
      exclusivity: "capped", format: "mixer",
      description: "A talk and mixer on agentic commerce, payments and messaging interfaces.",
    }),
    cosineByPerson: { p_robotics: 0.25, p_investor: 0.34, p_sparse: 0.23, p_novector: 0.28 },
  },
];

/**
 * Materialises the cast for one selected person, pinning each event's vector so
 * the cosine — and therefore the relevance score — is exactly as specified.
 * Priya is left unembedded on purpose, which forces the keyword fallback.
 */
export function buildSandbox(personId: string): {
  person: SandboxPerson;
  rows: { event: SandboxEvent; profile: Profile; link: CuratedLink }[];
} {
  const person = SANDBOX_PEOPLE.find((p) => p.id === personId) ?? SANDBOX_PEOPLE[0];
  const useVectors = person.id !== "p_novector";

  const rows = SANDBOX_EVENTS.map((event) => {
    const c = event.cosineByPerson[person.id] ?? 0.2;
    const [pv, lv] = vectorPair(c);
    return {
      event,
      profile: { ...person.profile, id: person.id, embedding: useVectors ? pv : null },
      link: { ...event.link, id: event.id, embedding: useVectors ? lv : null },
    };
  });
  return { person, rows };
}

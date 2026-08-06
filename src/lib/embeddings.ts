import { createOpenAI } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import type { curatedLinks, events, profiles } from "@/db/schema";

/**
 * Semantic-embedding layer for discovery matching. Turns a profile and an
 * event/link into vectors whose cosine similarity is the *relevance* half of
 * the ranking (see lib/scoring.ts and docs/superpowers/specs).
 *
 * Deliberately degrades to null when OPENAI_API_KEY is absent or a call fails —
 * callers fall back to the keyword-fit heuristic, so the app never hard-depends
 * on embeddings being populated. This is why every schema embedding column is
 * nullable and every read path tolerates a missing vector.
 */

/** text-embedding-3-small native dimensionality. Must match the vector(N) columns. */
export const EMBEDDING_DIM = 1536;
const MODEL_ID = "text-embedding-3-small";

/**
 * Resolves the OpenAI key, tolerating the casing the key was actually stored
 * under. Env var names are case-sensitive on Linux, so a var added as
 * `OpenAI_API_Key` is invisible to `process.env.OPENAI_API_KEY` and embeddings
 * silently fall back to keyword matching. Vercel marks the key "Sensitive"
 * (write-only) and disables renaming it, so the value can't simply be moved to
 * the canonical name — we match case-insensitively instead. Prefers the exact
 * canonical name when it exists.
 */
function resolveOpenAIKey(): string | undefined {
  const canonical = process.env.OPENAI_API_KEY;
  if (canonical) return canonical;
  for (const [name, value] of Object.entries(process.env)) {
    if (value && name.toLowerCase() === "openai_api_key") return value;
  }
  return undefined;
}

/** Cheap gate the rest of the app checks before doing embedding work. */
export function embeddingsEnabled(): boolean {
  return !!resolveOpenAIKey();
}

/** Provider bound to the resolved key. Built per call rather than at module
 * load so it picks up env that arrives later (e.g. dotenv in scripts), and so
 * the key is never read when embeddings are disabled. */
function provider() {
  return createOpenAI({ apiKey: resolveOpenAIKey() });
}

/** Embed one document. Returns null when embeddings are disabled, the input is
 * empty, or the provider call fails — never throws into a request path. */
export async function embedText(text: string): Promise<number[] | null> {
  const value = text.trim();
  if (!embeddingsEnabled() || !value) return null;
  try {
    const { embedding } = await embed({
      model: provider().textEmbedding(MODEL_ID),
      value,
    });
    return embedding;
  } catch (err) {
    console.error("embedText failed:", err);
    return null;
  }
}

/** Max inputs per embedMany request. OpenAI caps embedding batches (2048
 * inputs, ~300k tokens); chunking keeps a large backfill under the ceiling and
 * localizes a failure to one chunk instead of nulling everything. */
const EMBED_BATCH = 96;

/** Embed many documents, preserving input order and index alignment. Blank
 * documents map to null (same as embedText — never a garbage "space" vector,
 * which would otherwise be stored as non-null and suppress the keyword
 * fallback). A failed chunk leaves only its own slots null. */
export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = texts.map(() => null);
  if (!embeddingsEnabled() || texts.length === 0) return results;

  // Only embed documents with real content; blanks stay null.
  const jobs = texts
    .map((t, i) => ({ text: t.trim(), i }))
    .filter((j) => j.text.length > 0);

  for (let start = 0; start < jobs.length; start += EMBED_BATCH) {
    const chunk = jobs.slice(start, start + EMBED_BATCH);
    try {
      const { embeddings } = await embedMany({
        model: provider().textEmbedding(MODEL_ID),
        values: chunk.map((j) => j.text),
      });
      chunk.forEach((j, k) => {
        results[j.i] = embeddings[k];
      });
    } catch (err) {
      console.error("embedTexts chunk failed:", err);
      // Leave this chunk's slots null; other chunks still populate.
    }
  }
  return results;
}

type Profile = typeof profiles.$inferSelect;
type CuratedLink = typeof curatedLinks.$inferSelect;
type Event = typeof events.$inferSelect;

/**
 * The text we embed for a profile: who they are and what they're working on.
 *
 * Resume text is DELIBERATELY EXCLUDED. It used to be appended (truncated at 6k
 * chars) on the theory that it was the richest signal we store. Measured on the
 * evaluation corpus with real resumes for all 50 users, including it is a
 * regression: NDCG@10 -4.6pp (paired t = -2.22, 32 users worse vs 16 better),
 * MRR -5.0, FP@10 +1.0. Truncating to 800 chars does NOT recover it (t = 1.37,
 * noise), because the problem isn't length — it's that a resume is mostly
 * *career history*, and history is topically different from what someone wants
 * to do next. A GPU-infra founder's resume is four years of enterprise Java at
 * a bank, and that drags their vector toward the wrong rooms.
 *
 * Excluding it also makes documents uniform (~420 chars instead of ~3,650), so
 * cosine scores are comparable ACROSS users — which per-user thresholds and the
 * digest's relative band depend on — and cuts embedding cost ~8x.
 *
 * The resume is not wasted: the host's applicant screening reads it directly
 * (computeSemanticScore takes resumeText as its own argument), which is where
 * career history genuinely belongs.
 */
export function buildProfileDocument(
  profile: Pick<
    Profile,
    "fullName" | "title" | "company" | "profileType" | "bioBlurb" | "interests" | "tags"
  >,
): string {
  const parts: string[] = [];
  if (profile.title || profile.company) {
    parts.push([profile.title, profile.company].filter(Boolean).join(" at "));
  }
  if (profile.profileType?.length) parts.push(`Role: ${profile.profileType.join(", ")}`);
  if (profile.bioBlurb?.trim()) parts.push(profile.bioBlurb.trim());
  if (profile.interests?.length) parts.push(`Interests: ${profile.interests.join(", ")}`);
  if (profile.tags?.length) parts.push(profile.tags.join(", "));
  return parts.join("\n");
}

/** The text we embed for a curated (external) link: its scraped identity plus
 * the human-judged classification fields. */
export function buildLinkDocument(
  link: Pick<CuratedLink, "title" | "description" | "category" | "format" | "tags">,
): string {
  const parts: string[] = [];
  if (link.title?.trim()) parts.push(link.title.trim());
  if (link.description?.trim()) parts.push(link.description.trim());
  parts.push(`Category: ${link.category}`);
  parts.push(`Format: ${link.format}`);
  if (link.tags?.length) parts.push(link.tags.join(", "));
  return parts.join("\n");
}

/** The text we embed for a hosted event, including the host's ideal-attendee brief. */
export function buildEventDocument(
  event: Pick<Event, "title" | "description" | "category" | "idealAttendeeBrief" | "tags">,
): string {
  const parts: string[] = [];
  if (event.title?.trim()) parts.push(event.title.trim());
  if (event.description?.trim()) parts.push(event.description.trim());
  parts.push(`Category: ${event.category}`);
  if (event.idealAttendeeBrief?.trim()) {
    parts.push(`Ideal attendee: ${event.idealAttendeeBrief.trim()}`);
  }
  if (event.tags?.length) parts.push(event.tags.join(", "));
  return parts.join("\n");
}

/** Cosine similarity of two equal-length vectors, in [-1, 1]. Returns 0 for a
 * dimension mismatch or a zero vector rather than NaN, so ranking never breaks. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

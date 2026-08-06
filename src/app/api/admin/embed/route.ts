import { auth } from "@/auth";
import { embedTexts, embeddingsEnabled } from "@/lib/embeddings";

/**
 * Narrow, authenticated embedding utility.
 *
 * The OpenAI key is stored "Sensitive" in Vercel — write-only and
 * unrecoverable — so it exists only inside a deployment. Offline tooling (the
 * recommender evaluation harness in scripts/eval) therefore has no way to embed
 * text locally. Rather than distributing the secret, this exposes the single
 * capability that tooling needs, behind the same trust boundary as the backfill
 * endpoint.
 *
 * Deliberately bounded so it can't be used as a general free embedding proxy:
 * auth required, batch and per-text size capped.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HOST_USER_ID = "6a741461-1a2a-4313-b428-2bcf680d5f14"; // Serena Wang
const MAX_TEXTS = 128;
const MAX_CHARS = 8000;

async function authorize(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  const session = await auth();
  return session?.user?.id === HOST_USER_ID;
}

export async function POST(req: Request) {
  if (!(await authorize(req))) return new Response("Not authorized", { status: 401 });
  if (!embeddingsEnabled()) {
    return Response.json({ error: "No OpenAI key visible to this deployment." }, { status: 400 });
  }

  let body: { texts?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const texts = body.texts;
  if (!Array.isArray(texts) || texts.some((t) => typeof t !== "string")) {
    return Response.json({ error: "Expected { texts: string[] }." }, { status: 400 });
  }
  if (texts.length === 0 || texts.length > MAX_TEXTS) {
    return Response.json({ error: `texts must be 1..${MAX_TEXTS} items.` }, { status: 400 });
  }
  if ((texts as string[]).some((t) => t.length > MAX_CHARS)) {
    return Response.json({ error: `each text must be <= ${MAX_CHARS} chars.` }, { status: 400 });
  }

  const embeddings = await embedTexts(texts as string[]);
  return Response.json({
    embeddings,
    embedded: embeddings.filter(Boolean).length,
    requested: texts.length,
  });
}

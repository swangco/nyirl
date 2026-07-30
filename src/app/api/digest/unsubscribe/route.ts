import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { verifyUnsubscribe } from "@/lib/unsubscribe";

// Reads params + writes; never cache.
export const dynamic = "force-dynamic";

function page(body: string): Response {
  return new Response(
    `<!doctype html><html><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#211d19;">
      ${body}
      <p style="color:#756c5c;font-size:14px;margin-top:24px;">Browse everything anytime at <a href="https://nyirl.vercel.app">nyirl.vercel.app</a>.</p>
    </body></html>`,
    { headers: { "content-type": "text/html" } },
  );
}

function readParams(req: Request): { userId: string | null; token: string } {
  const { searchParams } = new URL(req.url);
  return {
    userId: searchParams.get("userId") ?? searchParams.get("uid"),
    token: searchParams.get("token") ?? "",
  };
}

// GET has NO side effect. A mail scanner / link prefetcher visiting the link
// must not unsubscribe anyone — it just renders a confirmation the human clicks,
// which POSTs. The link is also HMAC-signed so an arbitrary userId can't be
// unsubscribed by guessing the URL.
export async function GET(req: Request) {
  const { userId, token } = readParams(req);
  if (!userId || !verifyUnsubscribe(userId, token)) {
    return page("<p>This unsubscribe link is invalid or has expired.</p>");
  }
  return page(`
    <p style="font-size:16px;">Unsubscribe from the weekly NY IRL digest?</p>
    <form method="post" style="margin-top:16px;">
      <button type="submit" style="border:none;border-radius:999px;background:#211d19;color:#f9f7f1;padding:10px 22px;font-size:14px;cursor:pointer;">Yes, unsubscribe me</button>
    </form>`);
}

export async function POST(req: Request) {
  const { userId, token } = readParams(req);
  if (!userId || !verifyUnsubscribe(userId, token)) {
    return page("<p>This unsubscribe link is invalid or has expired.</p>");
  }
  await db.update(profiles).set({ digestOptOut: true }).where(eq(profiles.userId, userId));
  return page("<p>You've been unsubscribed from the weekly NY IRL digest.</p>");
}

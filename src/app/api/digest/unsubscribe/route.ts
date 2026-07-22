import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";

export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return new Response("Missing userId", { status: 400 });
  }

  await db.update(profiles).set({ digestOptOut: true }).where(eq(profiles.userId, userId));

  return new Response(
    `<!doctype html><html><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#211d19;">
      <p>You've been unsubscribed from the weekly NY IRL digest.</p>
      <p style="color:#756c5c;font-size:14px;">You can still browse everything anytime at <a href="https://nyirl.vercel.app">nyirl.vercel.app</a>.</p>
    </body></html>`,
    { headers: { "content-type": "text/html" } },
  );
}

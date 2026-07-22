import { eq, gte } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "@/db";
import { curatedLinks, digestSends, events, profiles } from "@/db/schema";
import { buildDigestItems, renderDigestEmail } from "@/lib/digest";
import { signUnsubscribe } from "@/lib/unsubscribe";

const APP_URL = "https://nyirl.vercel.app";

export async function GET(req: Request) {
  // Fail closed: if the secret isn't configured, refuse rather than accept the
  // guessable literal "Bearer undefined".
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET not set — refusing to run the weekly digest.");
    return new Response("Server misconfigured", { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Not authorized", { status: 401 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error("RESEND_API_KEY not set — skipping weekly digest run.");
    return Response.json({ sent: 0, skipped: "no RESEND_API_KEY configured" });
  }
  const resend = new Resend(resendApiKey);

  const now = new Date();

  const [eligibleProfiles, upcomingEvents, upcomingLinks, allSends] = await Promise.all([
    db.query.profiles.findMany({
      where: eq(profiles.digestOptOut, false),
    }),
    db.query.events.findMany({ where: gte(events.date, now) }),
    db.query.curatedLinks.findMany({ where: gte(curatedLinks.eventDate, now) }),
    db.query.digestSends.findMany(),
  ]);

  const sentByUser = new Map<string, Set<string>>();
  for (const send of allSends) {
    const set = sentByUser.get(send.userId) ?? new Set<string>();
    set.add(`${send.itemKind}:${send.itemId}`);
    sentByUser.set(send.userId, set);
  }

  let emailsSent = 0;
  let skippedEmpty = 0;

  for (const profile of eligibleProfiles) {
    const alreadySent = sentByUser.get(profile.userId) ?? new Set<string>();
    const items = buildDigestItems(
      profile,
      upcomingEvents,
      upcomingLinks,
      alreadySent,
      APP_URL,
    );

    if (items.length === 0) {
      skippedEmpty++;
      continue;
    }

    const unsubscribeUrl = `${APP_URL}/api/digest/unsubscribe?userId=${profile.userId}&token=${signUnsubscribe(profile.userId)}`;

    try {
      await resend.emails.send({
        from: "NY IRL <onboarding@resend.dev>",
        to: profile.email,
        subject: "This week at NY IRL",
        html: renderDigestEmail(profile.fullName, items, unsubscribeUrl),
      });

      await db.insert(digestSends).values(
        items.map((item) => ({
          userId: profile.userId,
          itemKind: item.kind,
          itemId: item.id,
        })),
      );

      emailsSent++;
    } catch (err) {
      console.error(`Digest send failed for ${profile.userId}:`, err);
    }
  }

  return Response.json({ sent: emailsSent, skippedEmpty, totalEligible: eligibleProfiles.length });
}

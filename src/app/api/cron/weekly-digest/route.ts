import { eq, gte } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "@/db";
import { curatedLinks, digestSends, events, profiles } from "@/db/schema";
import { buildDigestItems, renderDigestEmail } from "@/lib/digest";
import { signUnsubscribe } from "@/lib/unsubscribe";

/** Public origin used for links in the email. Override per-environment so a
 * preview deploy doesn't send production links. */
const APP_URL = process.env.APP_URL ?? "https://nyirl.vercel.app";

/** Sender. Resend's shared `onboarding@resend.dev` only delivers to the Resend
 * account owner's own inbox — switching to a verified domain is a config change
 * (set DIGEST_FROM), not a code change. */
const DIGEST_FROM = process.env.DIGEST_FROM ?? "NY IRL <onboarding@resend.dev>";

export async function GET(req: Request) {
  // --- Dormant until a sending key exists -------------------------------
  // Checked before auth on purpose: with no RESEND_API_KEY the digest cannot
  // send, so this endpoint does no work, touches no data, and has nothing to
  // protect. Returning 200 (not 500) keeps the weekly Vercel cron green while
  // the feature is intentionally switched off — a failing cron every Monday
  // would be misleading noise, and would train everyone to ignore real alerts.
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return Response.json({
      status: "dormant",
      sent: 0,
      reason: "RESEND_API_KEY not configured — digest is intentionally off.",
      toActivate: [
        "Set RESEND_API_KEY in Vercel",
        "Set CRON_SECRET in Vercel (this endpoint fails closed without it once active)",
        "Set DIGEST_FROM to a verified sending domain (the default resend.dev sender only reaches the Resend account owner)",
        "Verify with ?dryRun=1, then ?testTo=you@example.com, before the first real run",
      ],
    });
  }

  // --- Active: authenticate, failing closed -----------------------------
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET not set — refusing to run the weekly digest.");
    return new Response("Server misconfigured", { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Not authorized", { status: 401 });
  }

  // Verification modes (both auth-gated, neither records digest_sends):
  //   ?dryRun=1            — compute exactly what would be sent, send nothing.
  //   ?testTo=addr         — send one real email to `addr` only.
  // Recording is skipped in both so a verification run can't silently burn
  // items: digest_sends dedup means an item is only ever emailed once, so a
  // bad first send would permanently suppress those picks.
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const testTo = url.searchParams.get("testTo");

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
  const preview: { email: string; items: { title: string; score: number }[] }[] = [];

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

    if (dryRun) {
      preview.push({
        email: profile.email,
        items: items.map((i) => ({ title: i.title, score: i.score })),
      });
      continue;
    }

    const unsubscribeUrl = `${APP_URL}/api/digest/unsubscribe?userId=${profile.userId}&token=${signUnsubscribe(profile.userId)}`;

    try {
      await resend.emails.send({
        from: DIGEST_FROM,
        to: testTo ?? profile.email,
        subject: "This week at NY IRL",
        html: renderDigestEmail(profile.fullName, items, unsubscribeUrl),
      });

      if (!testTo) {
        await db.insert(digestSends).values(
          items.map((item) => ({
            userId: profile.userId,
            itemKind: item.kind,
            itemId: item.id,
          })),
        );
      }

      emailsSent++;
    } catch (err) {
      console.error(`Digest send failed for ${profile.userId}:`, err);
    }

    // A test send only needs one email to prove delivery works.
    if (testTo) break;
  }

  if (dryRun) {
    return Response.json({
      status: "dry-run",
      wouldSend: preview.length,
      skippedEmpty,
      totalEligible: eligibleProfiles.length,
      from: DIGEST_FROM,
      preview,
    });
  }

  return Response.json({
    status: testTo ? "test-send" : "sent",
    sent: emailsSent,
    skippedEmpty,
    totalEligible: eligibleProfiles.length,
    ...(testTo ? { testTo, recorded: false } : {}),
  });
}

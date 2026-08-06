import type { curatedLinks, events, profiles } from "@/db/schema";
import { trackedHref } from "@/lib/links";
import { computeStructuralScore, scoreCuratedLink } from "@/lib/scoring";

/**
 * Selection for the weekly digest. Implements "better to skip a week than send
 * a weak pick" (Serena, 2026-07-22) at the EMAIL level rather than per item.
 *
 * A single absolute cutoff was tried and does not work. It is simultaneously
 * too strict and too loose, and which one depends on the weights:
 *  - Under the old 0.6/0.4 blend, an absolute 80 was unreachable for most
 *    people — measured on live data, 2 of 4 real users had a best-ever score of
 *    71 and 60, so they could never receive a single item no matter how good
 *    curation got.
 *  - Under the current 0.8/0.2 blend the same constant becomes too loose: an
 *    unknown-host, open, out-of-town expo (CQS 18) reaches 0.8·100 + 0.2·18 =
 *    83.6 on match alone. On the evaluation corpus the number of items clearing
 *    80 with CQS < 50 rose from 4 to 129.
 *
 * So selection is now RELATIVE to what that user could plausibly get, with an
 * absolute quality floor to keep junk out, and a minimum-count rule that skips
 * the whole send rather than padding it.
 */
/** Never email an item whose room quality is this poor, however well it matches. */
export const DIGEST_MIN_QUALITY = 40;
/** Keep items within this fraction of the user's own best score. */
export const DIGEST_RELATIVE_BAND = 0.85;
/** Send at most this many curated links per email. */
export const DIGEST_MAX_LINKS = 4;
/** Below this many qualifying links, skip the week entirely (hosted events aside). */
export const DIGEST_MIN_LINKS = 1;

/** Where digest links point when a caller doesn't pass its own origin. */
const DEFAULT_APP_URL = "https://nyirl.vercel.app";

type Profile = typeof profiles.$inferSelect;
type Event = typeof events.$inferSelect;
type CuratedLink = typeof curatedLinks.$inferSelect;

export type DigestItem = {
  kind: "event" | "link";
  id: string;
  title: string;
  description: string | null;
  date: Date;
  href: string;
  score: number;
  /** Unrounded score — sort by this, not `score` (see LinkScore.sortKey). */
  sortKey: number;
};

const isProfileComplete = (profile: Profile) =>
  !!profile.fullName &&
  (profile.profileType?.length ?? 0) > 0 &&
  !!profile.bioBlurb?.trim();

/**
 * Builds this week's digest for one profile: Serena's own upcoming events
 * (always included, unscored, mirroring the homepage pin) plus curated
 * links selected relative to that user's own best match (see the selection
 * constants above).
 * `alreadySent` excludes anything already emailed to this person before —
 * an item is only ever sent once, however many weeks it stays upcoming.
 * Link scoring uses the same scoreCuratedLink as every on-site surface, so the
 * digest can't diverge from what the site shows. Links route through /api/out
 * for click attribution (source=digest).
 */
export function buildDigestItems(
  profile: Profile,
  upcomingEvents: Event[],
  upcomingLinks: CuratedLink[],
  alreadySent: Set<string>,
  appUrl: string = DEFAULT_APP_URL,
): DigestItem[] {
  if (!isProfileComplete(profile)) return [];

  const eventItems: DigestItem[] = upcomingEvents
    .filter((e) => !alreadySent.has(`event:${e.id}`))
    .map((e) => ({
      kind: "event" as const,
      id: e.id,
      title: e.title,
      description: e.description,
      date: e.date,
      href: trackedHref({
        id: e.id,
        kind: "event",
        source: "digest",
        uid: profile.userId,
        base: appUrl,
      }),
      score: computeStructuralScore(profile, e.criteriaWeights, e.tags),
      sortKey: computeStructuralScore(profile, e.criteriaWeights, e.tags),
    }));

  const candidateLinks = upcomingLinks
    .filter((l) => !alreadySent.has(`link:${l.id}`) && l.eventDate)
    .map((l) => {
      const s = scoreCuratedLink(profile, l, {
        profileEmbedding: profile.embedding,
        linkEmbedding: l.embedding,
      });
      return {
        kind: "link" as const,
        id: l.id,
        title: l.title || l.sourceUrl,
        description: l.description,
        date: l.eventDate!,
        href: trackedHref({
          id: l.id,
          kind: "link",
          source: "digest",
          uid: profile.userId,
          base: appUrl,
        }),
        score: s.score,
        sortKey: s.sortKey,
        quality: s.quality,
      };
    })
    // Hard floor first: a poorly-curated room is never worth emailing, however
    // well it happens to match.
    .filter((item) => item.quality >= DIGEST_MIN_QUALITY)
    .sort((a, b) => b.sortKey - a.sortKey);

  // Then relative to this user's own ceiling, so someone whose best match is a
  // 62 still gets their best few, while nobody gets filler far below their top.
  const best = candidateLinks[0]?.sortKey ?? 0;
  const selectedLinks = candidateLinks
    .filter((item) => item.sortKey >= best * DIGEST_RELATIVE_BAND)
    .slice(0, DIGEST_MAX_LINKS);

  // "Skip the week" applies to the EMAIL, not the item: too little to say means
  // send nothing rather than pad it out.
  const linkItems: DigestItem[] =
    selectedLinks.length >= DIGEST_MIN_LINKS ? selectedLinks : [];

  // Sort on the unrounded value: integer scores tie constantly across a large
  // catalogue, and ties would otherwise resolve to row order.
  return [...eventItems, ...linkItems].sort((a, b) => b.sortKey - a.sortKey);
}

/** Escapes text interpolated into the digest HTML — titles/descriptions are
 * scraped from third-party pages, so they can't go into markup raw. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderDigestEmail(fullName: string, items: DigestItem[], unsubscribeUrl: string): string {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid #ddd2bc;">
            <p style="margin:0 0 4px;font-family:ui-monospace,monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#8a6a3b;">
              ${item.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" })}${item.kind === "event" ? " · Hosted by NY IRL" : ""}
            </p>
            <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#211d19;">
              <a href="${escapeHtml(item.href)}" style="color:#211d19;text-decoration:none;">${escapeHtml(item.title)}</a>
            </p>
            ${item.description ? `<p style="margin:0;font-size:14px;color:#756c5c;">${escapeHtml(item.description)}</p>` : ""}
          </td>
        </tr>`,
    )
    .join("");

  return `
    <div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;">
      <p style="font-family:ui-monospace,monospace;font-size:12px;text-transform:uppercase;letter-spacing:0.14em;color:#8a6a3b;">This week at NY IRL</p>
      <p style="font-size:16px;color:#211d19;">Hi ${escapeHtml(fullName.split(" ")[0])}, here's what cleared the bar this week:</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <p style="margin-top:32px;font-size:12px;color:#8a8578;">
        <a href="${escapeHtml(unsubscribeUrl)}" style="color:#8a8578;">Unsubscribe from this weekly email</a>
      </p>
    </div>`;
}

import type { curatedLinks, events, profiles } from "@/db/schema";
import {
  computeBlendedLinkScore,
  computeCurationQualityScore,
  computeLinkFitScore,
  computeStructuralScore,
} from "@/lib/scoring";

/** Deliberately high — "better to skip a week than send a weak pick"
 * (Serena, 2026-07-22). Only curated links are gated on this; Serena's own
 * hosted events always make the cut, same as the homepage pin behavior. */
export const DIGEST_QUALITY_THRESHOLD = 80;

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
};

const isProfileComplete = (profile: Profile) =>
  !!profile.fullName &&
  (profile.profileType?.length ?? 0) > 0 &&
  !!profile.bioBlurb?.trim();

/**
 * Builds this week's digest for one profile: Serena's own upcoming events
 * (always included, unscored, mirroring the homepage pin) plus curated
 * links whose blended fit+quality score clears DIGEST_QUALITY_THRESHOLD.
 * `alreadySent` excludes anything already emailed to this person before —
 * an item is only ever sent once, however many weeks it stays upcoming.
 */
export function buildDigestItems(
  profile: Profile,
  upcomingEvents: Event[],
  upcomingLinks: CuratedLink[],
  alreadySent: Set<string>,
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
      href: `https://nyirl.vercel.app/events/${e.id}/apply`,
      score: computeStructuralScore(profile, e.criteriaWeights, e.tags),
    }));

  const linkItems: DigestItem[] = upcomingLinks
    .filter((l) => !alreadySent.has(`link:${l.id}`) && l.eventDate)
    .map((l) => ({
      kind: "link" as const,
      id: l.id,
      title: l.title || l.sourceUrl,
      description: l.description,
      date: l.eventDate!,
      href: l.sourceUrl,
      score: computeBlendedLinkScore(computeLinkFitScore(profile, l), computeCurationQualityScore(l)),
    }))
    .filter((item) => item.score >= DIGEST_QUALITY_THRESHOLD);

  return [...eventItems, ...linkItems].sort((a, b) => b.score - a.score);
}

export function renderDigestEmail(fullName: string, items: DigestItem[], unsubscribeUrl: string): string {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid #ddd2bc;">
            <p style="margin:0 0 4px;font-family:ui-monospace,monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#8a6a3b;">
              ${item.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${item.kind === "event" ? " · Hosted by NY IRL" : ""}
            </p>
            <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#211d19;">
              <a href="${item.href}" style="color:#211d19;text-decoration:none;">${item.title}</a>
            </p>
            ${item.description ? `<p style="margin:0;font-size:14px;color:#756c5c;">${item.description}</p>` : ""}
          </td>
        </tr>`,
    )
    .join("");

  return `
    <div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;">
      <p style="font-family:ui-monospace,monospace;font-size:12px;text-transform:uppercase;letter-spacing:0.14em;color:#8a6a3b;">This week at NY IRL</p>
      <p style="font-size:16px;color:#211d19;">Hi ${fullName.split(" ")[0]}, here's what cleared the bar this week:</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <p style="margin-top:32px;font-size:12px;color:#8a8578;">
        <a href="${unsubscribeUrl}" style="color:#8a8578;">Unsubscribe from this weekly email</a>
      </p>
    </div>`;
}

import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  curatedLinks,
  events,
  founderStageEnum,
  profiles,
  profileTypeEnum,
} from "@/db/schema";
import { saveProfile } from "@/lib/actions/profile";
import { computeLinkFitScore, computeStructuralScore } from "@/lib/scoring";
import { ProfileTypeFields } from "@/components/profile-type-fields";

const HOST_USER_ID = "6a741461-1a2a-4313-b428-2bcf680d5f14"; // Serena Wang

const inputClass =
  "rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-soft/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "text-sm font-medium text-foreground";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; required?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, session.user.id),
  });

  const { saved, required } = await searchParams;
  const isHost = session.user.id === HOST_USER_ID;

  const [allEvents, allLinks] = await Promise.all([
    db.query.events.findMany({
      orderBy: [asc(events.date)],
      with: { host: { with: { profile: true } } },
    }),
    db.query.curatedLinks.findMany({ orderBy: [desc(curatedLinks.createdAt)] }),
  ]);

  const recommendations = profile
    ? [
        ...allEvents.map((event) => ({
          kind: "event" as const,
          id: event.id,
          title: event.title,
          subtitle: `${event.date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}${event.host?.profile?.fullName ? ` · ${event.host.profile.fullName}` : ""}`,
          href: `/events/${event.id}/apply`,
          score: computeStructuralScore(profile, event.criteriaWeights),
        })),
        ...allLinks.map((link) => ({
          kind: "link" as const,
          id: link.id,
          title: link.title || link.sourceUrl,
          subtitle: "From around town",
          href: link.sourceUrl,
          score: computeLinkFitScore(profile, link),
        })),
      ]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
    : [];

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      {saved && (
        <div className="mb-6 rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-foreground">
          Profile saved.
        </div>
      )}
      {required && (
        <div className="mb-6 rounded-md border border-accent/30 bg-accent-soft px-4 py-2.5 text-sm text-foreground">
          Complete your profile before applying to an event.
        </div>
      )}

      <form action={saveProfile} className="flex flex-col gap-6">
        <label className="flex flex-col items-center gap-3 self-center">
          {profile?.headshotUrl ? (
            <img
              src={profile.headshotUrl}
              alt="Current headshot"
              className="h-24 w-24 rounded-full border border-line object-cover"
            />
          ) : (
            <div className="h-24 w-24 rounded-full border border-dashed border-line bg-surface" />
          )}
          <span className={labelClass}>Headshot</span>
          <input
            type="file"
            name="headshot"
            accept="image/*"
            className="text-sm text-foreground-soft file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Full name</span>
          <input
            name="fullName"
            defaultValue={profile?.fullName ?? session.user.name ?? ""}
            required
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>LinkedIn URL</span>
          <input
            name="linkedinUrl"
            type="url"
            placeholder="https://linkedin.com/in/..."
            defaultValue={profile?.linkedinUrl ?? ""}
            className={inputClass}
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Company</span>
            <input
              name="company"
              defaultValue={profile?.company ?? ""}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Title</span>
            <input
              name="title"
              defaultValue={profile?.title ?? ""}
              className={inputClass}
            />
          </label>
        </div>

        <ProfileTypeFields
          profileTypeEnum={profileTypeEnum}
          founderStageEnum={founderStageEnum}
          defaultTypes={profile?.profileType ?? []}
          defaultStage={profile?.stage ?? null}
          defaultFundingRaised={profile?.fundingRaised ?? null}
          defaultChecksWritten={profile?.checksWritten ?? null}
        />

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Bio blurb</span>
          <textarea
            name="bioBlurb"
            rows={4}
            placeholder="What are you building or looking for right now?"
            defaultValue={profile?.bioBlurb ?? ""}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Resume</span>
          {profile?.resumeUrl && (
            <a
              href={profile.resumeUrl}
              className="text-sm text-accent underline underline-offset-2"
              target="_blank"
            >
              Current resume
            </a>
          )}
          <input
            type="file"
            name="resume"
            accept="application/pdf"
            className="text-sm text-foreground-soft file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-foreground"
          />
        </label>

        <button
          type="submit"
          className="mt-2 self-start rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
        >
          Save profile
        </button>
      </form>

      {profile && (
        <div className="mt-14 border-t border-line pt-10">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent mb-3">
            Recommended for you
          </p>
          <p className="text-sm text-foreground-soft mb-6">
            Ranked by fit against the profile above.
          </p>
          <div className="flex flex-col gap-3">
            {recommendations.map((item) => (
              <a
                key={`${item.kind}-${item.id}`}
                href={item.href}
                target={item.kind === "link" ? "_blank" : undefined}
                rel={item.kind === "link" ? "noopener noreferrer" : undefined}
                className="flex items-start justify-between gap-4 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent/40"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-sm text-foreground-soft">
                    {item.subtitle}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-lg font-semibold tabular-nums">
                    {item.score}
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-foreground-soft/70">
                    fit
                  </div>
                </div>
              </a>
            ))}
            {recommendations.length === 0 && (
              <p className="text-sm text-foreground-soft">
                Nothing to recommend yet.
              </p>
            )}
          </div>

          {isHost && (
            <Link
              href="/curate"
              className="mt-6 inline-block text-sm text-accent underline underline-offset-2"
            >
              Manage what you've curated ({allLinks.length} link
              {allLinks.length === 1 ? "" : "s"}) →
            </Link>
          )}
        </div>
      )}
    </main>
  );
}

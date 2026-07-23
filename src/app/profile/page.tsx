import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  ageRangeEnum,
  curatedLinks,
  events,
  founderStageEnum,
  genderIdentityEnum,
  interestTagEnum,
  profiles,
  profileTypeEnum,
} from "@/db/schema";
import { saveProfile } from "@/lib/actions/profile";
import { isPrefetchRequest, logImpressions } from "@/lib/interactions";
import { trackedHref } from "@/lib/links";
import { computeStructuralScore, describeFit, scoreCuratedLink } from "@/lib/scoring";
import { EmptyState } from "@/components/empty-state";
import { FitScore, ReasonChip } from "@/components/fit-score";
import { ListingCard } from "@/components/listing-card";
import { PageShell } from "@/components/page-shell";
import { ProfileTypeFields } from "@/components/profile-type-fields";

const HOST_USER_ID = "6a741461-1a2a-4313-b428-2bcf680d5f14"; // Serena Wang

const GENDER_LABELS: Record<(typeof genderIdentityEnum)[number], string> = {
  woman: "Woman",
  man: "Man",
  non_binary: "Non-binary",
  prefer_not_to_say: "Prefer not to say",
};

const AGE_RANGE_LABELS: Record<(typeof ageRangeEnum)[number], string> = {
  under_25: "Under 25",
  "25_34": "25–34",
  "35_44": "35–44",
  "45_54": "45–54",
  "55_plus": "55+",
};

const INTEREST_LABELS: Record<(typeof interestTagEnum)[number], string> = {
  pickleball: "Pickleball",
  pilates: "Pilates",
  boxing: "Boxing",
  yoga: "Yoga",
  running: "Running",
  tennis: "Tennis",
  golf: "Golf",
  cycling: "Cycling",
  strength_training: "Strength training",
  wine: "Wine",
  live_music: "Live music",
  art: "Art",
};

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

  // Only recommend what's still upcoming (this page previously ranked past
  // events too), and score links with the same scoreCuratedLink the homepage
  // uses so the numbers here can't diverge from what Discover shows. Gated on
  // profile completeness, same as the homepage and digest, so the three
  // surfaces agree on when a user is scorable.
  const isProfileComplete =
    !!profile?.fullName &&
    (profile.profileType?.length ?? 0) > 0 &&
    !!profile.bioBlurb?.trim();
  const now = new Date();
  const recommendations = profile && isProfileComplete
    ? [
        ...allEvents
          .filter((event) => event.date >= now)
          .map((event) => ({
            kind: "event" as const,
            id: event.id,
            title: event.title,
            eyebrow: `${event.date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              timeZone: "America/New_York",
            })}${event.host?.profile?.fullName ? ` · ${event.host.profile.fullName}` : ""}`,
            href: `/events/${event.id}/apply`,
            external: false,
            image: null as string | null,
            tier: null as string | null,
            reason: "",
            score: computeStructuralScore(profile, event.criteriaWeights, event.tags),
          })),
        ...allLinks
          .filter((link) => link.eventDate && link.eventDate >= now)
          .map((link) => {
            const s = scoreCuratedLink(profile, link, {
              profileEmbedding: profile.embedding,
              linkEmbedding: link.embedding,
            });
            const { tier, reason } = describeFit(link, s);
            return {
              kind: "link" as const,
              id: link.id,
              title: link.title || link.sourceUrl,
              eyebrow: "From around town",
              href: trackedHref({ id: link.id, kind: "link", source: "profile" }),
              external: true,
              image: link.imageUrl as string | null,
              tier: tier as string | null,
              reason,
              score: s.score,
            };
          }),
      ]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
    : [];

  if (profile && recommendations.length > 0 && !(await isPrefetchRequest())) {
    const userId = profile.userId;
    after(() =>
      logImpressions(
        recommendations.map((r) => ({ kind: r.kind, id: r.id, score: r.score })),
        { userId, source: "profile" },
      ),
    );
  }

  return (
    <PageShell width="narrow">
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
          <span className={labelClass}>Email</span>
          <input
            name="email"
            type="email"
            defaultValue={profile?.email ?? session.user.email ?? ""}
            required
            className={inputClass}
          />
          <span className="text-xs text-foreground-soft">
            Where your weekly digest and any host follow-ups go — defaults to
            your sign-in email, but you can use a different one.
          </span>
        </label>

        <label className="flex items-start justify-between gap-4 rounded-md border border-line bg-surface px-4 py-3">
          <span className="flex flex-col gap-0.5">
            <span className={labelClass}>Weekly digest</span>
            <span className="text-xs text-foreground-soft">
              A selective Monday email — only when something genuinely clears the bar.
            </span>
          </span>
          <input
            type="checkbox"
            name="digestSubscribed"
            defaultChecked={!profile?.digestOptOut}
            className="mt-1 h-4 w-4 shrink-0 accent-accent"
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <div className="rounded-md border border-line bg-surface p-4">
          <p className={labelClass}>A few optional extras</p>
          <p className="mt-1 mb-4 text-sm text-foreground-soft">
            None of this is required — sharing more just sharpens which
            events end up ranked highest for you.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Gender</span>
              <select
                name="genderIdentity"
                defaultValue={profile?.genderIdentity ?? ""}
                className={inputClass}
              >
                <option value="">Prefer not to say</option>
                {genderIdentityEnum
                  .filter((g) => g !== "prefer_not_to_say")
                  .map((g) => (
                    <option key={g} value={g}>
                      {GENDER_LABELS[g]}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Age range</span>
              <select
                name="ageRange"
                defaultValue={profile?.ageRange ?? ""}
                className={inputClass}
              >
                <option value="">Prefer not to say</option>
                {ageRangeEnum.map((range) => (
                  <option key={range} value={range}>
                    {AGE_RANGE_LABELS[range]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="mt-4 flex flex-col gap-2.5">
            <legend className={labelClass}>Interests</legend>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
              {interestTagEnum.map((interest) => (
                <label
                  key={interest}
                  className="flex min-h-10 items-center gap-2.5 text-sm text-foreground-soft has-checked:text-foreground"
                >
                  <input
                    type="checkbox"
                    name="interests"
                    value={interest}
                    defaultChecked={profile?.interests?.includes(interest) ?? false}
                    className="h-4 w-4 accent-accent"
                  />
                  {INTEREST_LABELS[interest]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

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
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-accent">
            Recommended for you
          </p>
          <p className="mb-6 text-sm text-foreground-soft">
            Ranked by fit against the profile above.
          </p>
          {recommendations.length === 0 ? (
            <EmptyState
              eyebrow={isProfileComplete ? "Nothing upcoming" : "Almost there"}
              title={
                isProfileComplete
                  ? "No upcoming events match yet — new rooms get curated weekly."
                  : "Add your role and a short bio above to start seeing matches."
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {recommendations.map((item) => (
                <ListingCard
                  key={`${item.kind}-${item.id}`}
                  href={item.href}
                  external={item.external}
                  image={item.image}
                  eyebrow={item.eyebrow}
                  title={item.title}
                  chip={
                    item.kind === "link" && item.reason ? (
                      <ReasonChip>{item.reason}</ReasonChip>
                    ) : undefined
                  }
                  aside={
                    item.kind === "link" && item.tier ? (
                      <FitScore score={item.score} tier={item.tier} />
                    ) : undefined
                  }
                />
              ))}
            </div>
          )}

          {isHost && (
            <Link
              href="/curate"
              className="mt-6 inline-block text-sm text-accent underline underline-offset-2"
            >
              Manage what you host ({allLinks.length} link
              {allLinks.length === 1 ? "" : "s"}) →
            </Link>
          )}
        </div>
      )}
    </PageShell>
  );
}

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { profiles, profileTypeEnum } from "@/db/schema";
import { saveProfile } from "@/lib/actions/profile";

const PROFILE_TYPE_LABELS: Record<(typeof profileTypeEnum)[number], string> = {
  founder: "Founder",
  operator: "Operator",
  investor: "Investor",
  engineer: "Engineer",
  marketing_gtm: "Marketing / GTM",
  job_seeking: "Job-seeking",
  other: "Other",
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

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent mb-3">
        Your profile
      </p>
      <h1 className="font-serif text-3xl font-semibold tracking-tight mb-2">
        {profile ? "Keep it current" : "Build once, use everywhere"}
      </h1>
      <p className="text-sm text-foreground-soft mb-8">
        Reused for every event you apply to on NY IRL.
      </p>

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

        <fieldset className="flex flex-col gap-2.5">
          <legend className={labelClass}>Profile type</legend>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {profileTypeEnum.map((type) => (
              <label
                key={type}
                className="flex items-center gap-2 text-sm text-foreground-soft has-checked:text-foreground"
              >
                <input
                  type="checkbox"
                  name="profileType"
                  value={type}
                  defaultChecked={profile?.profileType?.includes(type)}
                  className="accent-accent"
                />
                {PROFILE_TYPE_LABELS[type]}
              </label>
            ))}
          </div>
        </fieldset>

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

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Headshot</span>
            {profile?.headshotUrl && (
              <img
                src={profile.headshotUrl}
                alt="Current headshot"
                className="h-16 w-16 rounded-full border border-line object-cover"
              />
            )}
            <input
              type="file"
              name="headshot"
              accept="image/*"
              className="text-sm text-foreground-soft file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-foreground"
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
        </div>

        <button
          type="submit"
          className="mt-2 self-start rounded-md bg-foreground px-6 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
        >
          Save profile
        </button>
      </form>
    </main>
  );
}

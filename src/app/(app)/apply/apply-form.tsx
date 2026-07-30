"use client";

import { useState } from "react";
import type { ageRangeEnum, genderIdentityEnum, interestTagEnum, profiles } from "@/db/schema";
import {
  ageRangeEnum as ageRangeValues,
  founderStageEnum,
  genderIdentityEnum as genderIdentityValues,
  interestTagEnum as interestTagValues,
  profileTypeEnum as profileTypeValues,
} from "@/db/schema";
import { saveProfile } from "@/lib/actions/profile";
import { ProfileTypeConditionalFields, ProfileTypeSelect } from "@/components/profile-type-fields";

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
const groupHeadingClass = "font-serif text-xl font-semibold text-foreground";
const groupIntroClass = "mt-1 text-sm text-foreground-soft";

export function ApplyForm({
  profile,
  sessionName,
  sessionEmail,
}: {
  profile: typeof profiles.$inferSelect | null;
  sessionName: string;
  sessionEmail: string;
}) {
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(
    new Set(profile?.profileType ?? []),
  );

  return (
    <form action={saveProfile} className="flex flex-col gap-10">
      <header>
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-accent">
          Get started
        </p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground text-balance">
          Build your profile
        </h1>
        <p className="mt-2 text-sm text-foreground-soft">
          Three short sections. Recommendations are ranked against what you tell us here.
        </p>
      </header>

      {/* 1. Who you are */}
      <section className="flex flex-col gap-6 border-t border-line pt-8">
        <div>
          <h2 className={groupHeadingClass}>Who you are</h2>
          <p className={groupIntroClass}>Full name, email, and what you do. Required.</p>
        </div>

        <label className="flex flex-col items-center gap-3 self-center">
          {profile?.headshotUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
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
            defaultValue={profile?.fullName ?? sessionName}
            required
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Email</span>
          <input
            name="email"
            type="email"
            defaultValue={profile?.email ?? sessionEmail}
            required
            className={inputClass}
          />
          <span className="text-xs text-foreground-soft">
            Where your weekly digest and any host follow-ups go — defaults to your sign-in
            email, but you can use a different one.
          </span>
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
            <input name="company" defaultValue={profile?.company ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Title</span>
            <input name="title" defaultValue={profile?.title ?? ""} className={inputClass} />
          </label>
        </div>

        <ProfileTypeSelect
          profileTypeEnum={profileTypeValues}
          defaultTypes={profile?.profileType ?? []}
          selected={selectedTypes}
          onChange={setSelectedTypes}
        />
      </section>

      {/* 2. What you're working on */}
      <section className="flex flex-col gap-6 border-t border-line pt-8">
        <div>
          <h2 className={groupHeadingClass}>What you&apos;re working on</h2>
          <p className={groupIntroClass}>A short bio. Required.</p>
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

        <ProfileTypeConditionalFields
          founderStageEnum={founderStageEnum}
          selected={selectedTypes}
          defaultStage={profile?.stage ?? null}
          defaultFundingRaised={profile?.fundingRaised ?? null}
          defaultChecksWritten={profile?.checksWritten ?? null}
        />

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
      </section>

      {/* 3. What you're into */}
      <section className="flex flex-col gap-6 border-t border-line pt-8">
        <div>
          <h2 className={groupHeadingClass}>What you&apos;re into</h2>
          <p className={groupIntroClass}>
            All optional — sharing more just sharpens which events rank highest for you.
          </p>
        </div>

        <fieldset className="flex flex-col gap-2.5">
          <legend className={labelClass}>Interests</legend>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
            {interestTagValues.map((interest) => (
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Gender</span>
            <select
              name="genderIdentity"
              defaultValue={profile?.genderIdentity ?? ""}
              className={inputClass}
            >
              <option value="">Prefer not to say</option>
              {genderIdentityValues
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
              {ageRangeValues.map((range) => (
                <option key={range} value={range}>
                  {AGE_RANGE_LABELS[range]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

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

      {/* saveProfile redirects to /profile?saved=1 internally (src/lib/actions/profile.ts,
          out of scope to change) — A6 wants /discover on success, flagged in the handoff. */}
      <button
        type="submit"
        className="self-start rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
      >
        Continue
      </button>
    </form>
  );
}

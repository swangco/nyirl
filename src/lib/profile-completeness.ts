import type { profiles } from "@/db/schema";

type ProfileCompletenessInput = Pick<
  typeof profiles.$inferSelect,
  "fullName" | "profileType" | "bioBlurb"
> | null | undefined;

export function isProfileComplete(profile: ProfileCompletenessInput): boolean {
  return (
    !!profile?.fullName &&
    (profile.profileType?.length ?? 0) > 0 &&
    !!profile.bioBlurb?.trim()
  );
}

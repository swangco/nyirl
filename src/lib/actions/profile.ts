"use server";

import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { extractText, getDocumentProxy } from "unpdf";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  ageRangeEnum,
  founderStageEnum,
  genderIdentityEnum,
  interestTagEnum,
  profiles,
  profileTypeEnum,
} from "@/db/schema";
import { buildProfileDocument, embedText } from "@/lib/embeddings";

export async function saveProfile(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }
  const userId = session.user.id;

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const linkedinUrl = String(formData.get("linkedinUrl") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const bioBlurb = String(formData.get("bioBlurb") ?? "").trim();
  const selectedTypes = formData
    .getAll("profileType")
    .map(String)
    .filter((t): t is (typeof profileTypeEnum)[number] =>
      (profileTypeEnum as readonly string[]).includes(t),
    );

  const stageRaw = String(formData.get("stage") ?? "");
  const stage = (founderStageEnum as readonly string[]).includes(stageRaw)
    ? (stageRaw as (typeof founderStageEnum)[number])
    : null;
  const fundingRaised = String(formData.get("fundingRaised") ?? "").trim();
  const checksWrittenRaw = String(formData.get("checksWritten") ?? "").trim();
  const checksWrittenParsed = checksWrittenRaw ? parseInt(checksWrittenRaw, 10) : null;
  // Guard against parseInt("abc") === NaN reaching the integer column (crash).
  const checksWritten =
    checksWrittenParsed !== null && !Number.isNaN(checksWrittenParsed)
      ? checksWrittenParsed
      : null;

  const genderIdentityRaw = String(formData.get("genderIdentity") ?? "");
  const genderIdentity = (genderIdentityEnum as readonly string[]).includes(genderIdentityRaw)
    ? (genderIdentityRaw as (typeof genderIdentityEnum)[number])
    : null;

  const ageRangeRaw = String(formData.get("ageRange") ?? "");
  const ageRange = (ageRangeEnum as readonly string[]).includes(ageRangeRaw)
    ? (ageRangeRaw as (typeof ageRangeEnum)[number])
    : null;

  const interests = formData
    .getAll("interests")
    .map(String)
    .filter((i): i is (typeof interestTagEnum)[number] =>
      (interestTagEnum as readonly string[]).includes(i),
    );

  if (!fullName) {
    throw new Error("Full name is required");
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email");
  }

  const headshot = formData.get("headshot");
  const resume = formData.get("resume");

  let headshotUrl: string | undefined;
  if (headshot instanceof File && headshot.size > 0) {
    const blob = await put(`headshots/${userId}-${headshot.name}`, headshot, {
      access: "public",
      addRandomSuffix: true,
    });
    headshotUrl = blob.url;
  }

  let resumeUrl: string | undefined;
  let resumeTextExtracted: string | undefined;
  if (resume instanceof File && resume.size > 0) {
    const bytes = new Uint8Array(await resume.arrayBuffer());

    const blob = await put(`resumes/${userId}-${resume.name}`, resume, {
      access: "public",
      addRandomSuffix: true,
    });
    resumeUrl = blob.url;

    try {
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      resumeTextExtracted = text;
    } catch (err) {
      console.error("Resume text extraction failed:", err);
    }
  }

  const existing = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });

  // Semantic-matching vector over the profile document. Uses the freshly
  // uploaded resume text if present, else whatever was previously extracted.
  // Returns null when OPENAI_API_KEY is unset — in that case we leave any
  // existing embedding untouched rather than wiping it.
  const embedding = await embedText(
    buildProfileDocument({
      fullName,
      title: title || null,
      company: company || null,
      profileType: selectedTypes,
      bioBlurb: bioBlurb || null,
      interests,
      tags: existing?.tags ?? null,
      resumeTextExtracted: resumeTextExtracted ?? existing?.resumeTextExtracted ?? null,
    }),
  );

  // Atomic upsert on the unique userId — replaces a check-then-insert that
  // could 500 on two concurrent first-saves. On update we only overwrite
  // headshot/resume/embedding when a new value was produced, preserving the
  // existing ones otherwise.
  const commonFields = {
    fullName,
    email,
    linkedinUrl: linkedinUrl || null,
    company: company || null,
    title: title || null,
    bioBlurb: bioBlurb || null,
    profileType: selectedTypes,
    stage,
    fundingRaised: fundingRaised || null,
    checksWritten,
    genderIdentity,
    ageRange,
    interests,
  };

  await db
    .insert(profiles)
    .values({
      userId,
      ...commonFields,
      headshotUrl,
      resumeUrl,
      resumeTextExtracted,
      ...(embedding ? { embedding } : {}),
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        ...commonFields,
        ...(headshotUrl ? { headshotUrl } : {}),
        ...(resumeUrl ? { resumeUrl } : {}),
        ...(resumeTextExtracted ? { resumeTextExtracted } : {}),
        ...(embedding ? { embedding } : {}),
        updatedAt: new Date(),
      },
    });

  redirect("/profile?saved=1");
}

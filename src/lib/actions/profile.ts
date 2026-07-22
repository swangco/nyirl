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

export async function saveProfile(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }
  const userId = session.user.id;

  const fullName = String(formData.get("fullName") ?? "").trim();
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
  const checksWritten = checksWrittenRaw ? parseInt(checksWrittenRaw, 10) : null;

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

  if (existing) {
    await db
      .update(profiles)
      .set({
        fullName,
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
        ...(headshotUrl ? { headshotUrl } : {}),
        ...(resumeUrl ? { resumeUrl } : {}),
        ...(resumeTextExtracted ? { resumeTextExtracted } : {}),
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, userId));
  } else {
    await db.insert(profiles).values({
      userId,
      fullName,
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
      headshotUrl,
      resumeUrl,
      resumeTextExtracted,
    });
  }

  redirect("/profile?saved=1");
}

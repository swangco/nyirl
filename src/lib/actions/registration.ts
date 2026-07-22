"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { events, profiles, registrations } from "@/db/schema";
import {
  computeCompositeScore,
  computeSemanticScore,
  computeStructuralScore,
} from "@/lib/scoring";

export async function applyToEvent(eventId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }
  const userId = session.user.id;

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });
  if (!profile) {
    redirect("/profile?required=1");
  }

  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });
  if (!event) {
    throw new Error("Event not found");
  }

  const existing = await db.query.registrations.findFirst({
    where: and(
      eq(registrations.eventId, eventId),
      eq(registrations.userId, userId),
    ),
  });
  if (existing) {
    redirect(`/events/${eventId}/apply?already=1`);
  }

  const structuralScore = computeStructuralScore(profile, event.criteriaWeights);
  const semantic = await computeSemanticScore({
    idealAttendeeBrief: event.idealAttendeeBrief,
    resumeText: profile.resumeTextExtracted,
    bioBlurb: profile.bioBlurb,
    title: profile.title,
    company: profile.company,
  });
  const compositeScore = computeCompositeScore(
    structuralScore,
    semantic.relevance_score,
  );

  await db.insert(registrations).values({
    eventId,
    userId,
    status: "pending",
    structuralScore,
    semanticScore: semantic.relevance_score,
    aiRationale: semantic.rationale,
    compositeScore,
  });

  redirect(`/events/${eventId}/apply?submitted=1`);
}

"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { events, profiles, registrations } from "@/db/schema";
import { logInteraction } from "@/lib/interactions";
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

  const structuralScore = computeStructuralScore(profile, event.criteriaWeights, event.tags);
  const semantic = await computeSemanticScore({
    idealAttendeeBrief: event.idealAttendeeBrief,
    resumeText: profile.resumeTextExtracted,
    bioBlurb: profile.bioBlurb,
    title: profile.title,
    company: profile.company,
  });
  // The model can return a fractional relevance_score; the column is an integer,
  // so round before insert (an unrounded value fails the whole application).
  const semanticScore = Math.round(semantic.relevance_score);
  const compositeScore = computeCompositeScore(structuralScore, semanticScore);

  // onConflictDoNothing makes a concurrent double-submit a no-op instead of a
  // unique-constraint 500 — the pre-check above already handles the common
  // "already applied" case. `returning` tells us whether this call actually
  // created the row, so the apply signal is logged exactly once (the losing
  // side of a race inserts nothing and must not log a second apply).
  const inserted = await db
    .insert(registrations)
    .values({
      eventId,
      userId,
      status: "pending",
      structuralScore,
      semanticScore,
      aiRationale: semantic.rationale,
      compositeScore,
    })
    .onConflictDoNothing()
    .returning({ id: registrations.id });

  if (inserted.length > 0) {
    await logInteraction({
      userId,
      itemKind: "event",
      itemId: eventId,
      action: "apply",
      source: "apply",
    });
  }

  redirect(`/events/${eventId}/apply?submitted=1`);
}

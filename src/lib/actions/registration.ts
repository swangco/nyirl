"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { events, profiles, registrations } from "@/db/schema";
import { logInteraction } from "@/lib/interactions";
import {
  applicantSemanticScore,
  computeCompositeScore,
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
  // Semantic relevance now comes from the precomputed embeddings (cosine of the
  // applicant's profile vector against the event's), not a per-application LLM
  // call. Falls back to a neutral 50 when embeddings aren't populated yet — the
  // same as the prior no-key behavior — and the host can request a qualitative
  // AI read per applicant on the dashboard.
  const semanticScore = applicantSemanticScore(profile.embedding, event.embedding) ?? 50;
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
      // Filled in lazily by the host via generateApplicantRationale — no LLM at apply time.
      aiRationale: null,
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

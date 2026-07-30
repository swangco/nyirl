"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { events, registrations, registrationStatusEnum } from "@/db/schema";
import { computeSemanticScore } from "@/lib/scoring";

export async function updateRegistrationStatus(
  eventId: string,
  registrationId: string,
  status: (typeof registrationStatusEnum)[number],
) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  // Enum is compile-time only and the column is plain text — validate at the
  // action boundary so a bogus status can't be persisted (and later crash the
  // applicant's status page).
  if (!(registrationStatusEnum as readonly string[]).includes(status)) {
    throw new Error("Invalid status");
  }

  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!event || event.hostId !== session.user.id) {
    throw new Error("Not authorized to manage this event");
  }

  // Constrain the update to a registration that actually belongs to this event,
  // so a host can't pass their own eventId with another event's registrationId
  // (cross-event IDOR). The event-ownership check above only proves they host
  // THIS event, not that the registration is one of its applicants.
  await db
    .update(registrations)
    .set({ status, decidedAt: new Date() })
    .where(and(eq(registrations.id, registrationId), eq(registrations.eventId, eventId)));

  revalidatePath(`/events/${eventId}/host`);
}

/**
 * Host-triggered, on-demand AI read of one applicant — the "lazy" half of the
 * hybrid: apply-time scoring is embedding-only (no LLM), and the qualitative
 * rationale + flags are generated with Haiku only when the host asks for them
 * on the dashboard. Keeps the per-application LLM call off the hot path while
 * preserving the human-readable note the host actually reads.
 */
export async function generateApplicantRationale(eventId: string, registrationId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!event || event.hostId !== session.user.id) {
    throw new Error("Not authorized to manage this event");
  }

  const reg = await db.query.registrations.findFirst({
    where: and(eq(registrations.id, registrationId), eq(registrations.eventId, eventId)),
    with: { user: { with: { profile: true } } },
  });
  if (!reg) {
    throw new Error("Registration not found");
  }

  const profile = reg.user.profile;
  const semantic = await computeSemanticScore({
    idealAttendeeBrief: event.idealAttendeeBrief,
    resumeText: profile?.resumeTextExtracted ?? null,
    bioBlurb: profile?.bioBlurb ?? null,
    title: profile?.title ?? null,
    company: profile?.company ?? null,
  });

  const note = semantic.flags.length
    ? `${semantic.rationale} · flags: ${semantic.flags.join(", ")}`
    : semantic.rationale;
  // Show the model's own score in the note for the host's reference, but leave
  // the stored semanticScore (embedding-based) untouched so the sort stays stable.
  await db
    .update(registrations)
    .set({ aiRationale: `AI read (${Math.round(semantic.relevance_score)}/100): ${note}` })
    .where(and(eq(registrations.id, registrationId), eq(registrations.eventId, eventId)));

  revalidatePath(`/events/${eventId}/host`);
}

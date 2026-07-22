"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { events, registrations, registrationStatusEnum } from "@/db/schema";

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

"use server";

import { eq } from "drizzle-orm";
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

  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) });
  if (!event || event.hostId !== session.user.id) {
    throw new Error("Not authorized to manage this event");
  }

  await db
    .update(registrations)
    .set({ status, decidedAt: new Date() })
    .where(eq(registrations.id, registrationId));

  revalidatePath(`/events/${eventId}/host`);
}

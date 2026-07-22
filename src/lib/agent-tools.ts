import { tool } from "ai";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { events, profiles, registrations } from "@/db/schema";

export const listEvents = tool({
  description:
    "List every event on NY IRL, with its date and how many people have applied.",
  inputSchema: z.object({}),
  execute: async () => {
    const allEvents = await db.query.events.findMany();
    const results = await Promise.all(
      allEvents.map(async (event) => {
        const regs = await db.query.registrations.findMany({
          where: eq(registrations.eventId, event.id),
        });
        return {
          id: event.id,
          title: event.title,
          date: event.date.toISOString(),
          capacity: event.capacity,
          applicantCount: regs.length,
        };
      }),
    );
    return results;
  },
});

export const getApplicantsForEvent = tool({
  description:
    "Get every applicant for a specific event (by event id), ranked by composite fit score, including their scores, profile type, bio, and current status.",
  inputSchema: z.object({
    eventId: z.string().describe("The event's id, from listEvents"),
  }),
  execute: async ({ eventId }) => {
    const regs = await db.query.registrations.findMany({
      where: eq(registrations.eventId, eventId),
      orderBy: [desc(registrations.compositeScore)],
      with: { user: { with: { profile: true } } },
    });
    return regs.map((r) => ({
      name: r.user.profile?.fullName ?? "(no profile)",
      title: r.user.profile?.title,
      company: r.user.profile?.company,
      profileType: r.user.profile?.profileType,
      bioBlurb: r.user.profile?.bioBlurb,
      compositeScore: r.compositeScore,
      structuralScore: r.structuralScore,
      semanticScore: r.semanticScore,
      aiRationale: r.aiRationale,
      status: r.status,
    }));
  },
});

export const getApplicantHistory = tool({
  description:
    "Look up which events a specific person has applied to across all of NY IRL's history, by matching their name. Use this to check if someone is a first-timer or a repeat attendee.",
  inputSchema: z.object({
    name: z.string().describe("Full name or partial name to search for"),
  }),
  execute: async ({ name }) => {
    const allProfiles = await db.query.profiles.findMany();
    const match = allProfiles.find((p) =>
      p.fullName.toLowerCase().includes(name.toLowerCase()),
    );
    if (!match) {
      return { found: false as const };
    }
    const regs = await db.query.registrations.findMany({
      where: eq(registrations.userId, match.userId),
      with: { event: true },
    });
    return {
      found: true as const,
      name: match.fullName,
      history: regs.map((r) => ({
        event: r.event.title,
        status: r.status,
        appliedAt: r.appliedAt.toISOString(),
      })),
    };
  },
});

export const agentTools = {
  listEvents,
  getApplicantsForEvent,
  getApplicantHistory,
};

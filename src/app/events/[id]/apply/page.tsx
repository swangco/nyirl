import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { events, profiles, registrations, registrationStatusEnum } from "@/db/schema";
import { PageShell } from "@/components/page-shell";
import { applyToEvent } from "@/lib/actions/registration";

// What an applicant sees for each decision state — closes the loop that
// previously dead-ended after "Application submitted".
const STATUS_COPY: Record<
  (typeof registrationStatusEnum)[number],
  { title: string; body: string; tone: "good" | "neutral" | "muted" }
> = {
  pending: {
    title: "Application under review",
    body: "The host is going through applicants — you'll hear back before the event.",
    tone: "neutral",
  },
  approved: {
    title: "You're in.",
    body: "The host approved your spot. Watch your email for the details.",
    tone: "good",
  },
  waitlisted: {
    title: "You're on the waitlist",
    body: "The host waitlisted you — you may still get a spot if space opens up.",
    tone: "neutral",
  },
  declined: {
    title: "Not this time",
    body: "The host couldn't offer you a spot for this one. There's plenty more to discover.",
    tone: "muted",
  },
  attended: {
    title: "Thanks for coming",
    body: "You attended this event.",
    tone: "good",
  },
};

const TONE_CLASS: Record<"good" | "neutral" | "muted", string> = {
  good: "border-accent/30 bg-accent-soft",
  neutral: "border-line bg-surface",
  muted: "border-line bg-surface text-foreground-soft",
};

export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string; already?: string; required?: string }>;
}) {
  const { id } = await params;
  const { submitted, required } = await searchParams;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/sign-in?next=/events/${id}/apply`);
  }

  const event = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!event) {
    return (
      <PageShell width="narrow">
        <p className="text-foreground-soft">
          This event doesn&apos;t exist or has been removed.
        </p>
      </PageShell>
    );
  }

  const [profile, registration, approvedRegs] = await Promise.all([
    db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) }),
    db.query.registrations.findFirst({
      where: and(eq(registrations.eventId, id), eq(registrations.userId, session.user.id)),
    }),
    event.capacity
      ? db.query.registrations.findMany({
          where: and(eq(registrations.eventId, id), eq(registrations.status, "approved")),
          columns: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const spotsLeft = event.capacity ? Math.max(0, event.capacity - approvedRegs.length) : null;

  const applyAction = applyToEvent.bind(null, id);
  // Fall back to the "pending" copy for any unexpected status, so a bad value
  // can never crash the applicant's page.
  const statusCopy = registration
    ? (STATUS_COPY[registration.status] ?? STATUS_COPY.pending)
    : null;

  return (
    <PageShell width="narrow">
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-accent">
        {event.date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          timeZone: "America/New_York",
        })}
      </p>
      <h1 className="mb-3 font-serif text-3xl font-semibold tracking-tight text-balance">
        {event.title}
      </h1>

      {(event.location || spotsLeft !== null) && (
        <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs uppercase tracking-[0.08em] text-foreground-soft">
          {event.location && <span>{event.location}</span>}
          {event.location && spotsLeft !== null && <span aria-hidden>·</span>}
          {spotsLeft !== null && (
            <span>
              {spotsLeft} of {event.capacity} {spotsLeft === 1 ? "spot" : "spots"} left
            </span>
          )}
        </div>
      )}

      {event.description && (
        <p className="mb-8 text-foreground-soft">{event.description}</p>
      )}

      {submitted && !registration && (
        <div className="mb-6 rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-foreground">
          Application submitted — you&apos;ll hear back from the host soon.
        </div>
      )}

      {required && (
        <div className="mb-6 rounded-md border border-accent/30 bg-accent-soft px-4 py-2.5 text-sm text-foreground">
          Complete your profile before applying.
        </div>
      )}

      {!profile ? (
        <a
          href="/profile"
          className="inline-block rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
        >
          Complete your profile to apply
        </a>
      ) : statusCopy ? (
        <div className={`rounded-lg border p-5 ${TONE_CLASS[statusCopy.tone]}`}>
          <p className="font-serif text-lg font-semibold text-foreground">{statusCopy.title}</p>
          <p className="mt-1 text-sm text-foreground-soft">{statusCopy.body}</p>
        </div>
      ) : (
        <form action={applyAction} className="rounded-lg border border-line bg-surface p-5">
          <p className="mb-4 text-sm text-foreground-soft">
            Applying as <strong className="text-foreground">{profile.fullName}</strong> using
            your saved profile.
          </p>
          <button
            type="submit"
            className="rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
          >
            Apply to attend
          </button>
        </form>
      )}
    </PageShell>
  );
}

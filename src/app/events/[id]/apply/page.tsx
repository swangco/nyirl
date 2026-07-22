import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { events, profiles } from "@/db/schema";
import { applyToEvent } from "@/lib/actions/registration";

export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string; already?: string; required?: string }>;
}) {
  const { id } = await params;
  const { submitted, already, required } = await searchParams;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/sign-in?next=/events/${id}/apply`);
  }

  const event = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!event) {
    return (
      <main className="mx-auto max-w-xl px-6 py-12">
        <p className="text-foreground-soft">
          This event doesn&apos;t exist or has been removed.
        </p>
      </main>
    );
  }

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, session.user.id),
  });

  const applyAction = applyToEvent.bind(null, id);

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent mb-3">
        {event.date.toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
      </p>
      <h1 className="font-serif text-3xl font-semibold tracking-tight mb-4 text-balance">
        {event.title}
      </h1>
      <p className="mb-8 text-foreground-soft">{event.description}</p>

      {submitted && (
        <div className="mb-6 rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-foreground">
          Application submitted — you&apos;ll hear back from the host soon.
        </div>
      )}

      {already && (
        <div className="mb-6 rounded-md border border-accent/30 bg-accent-soft px-4 py-2.5 text-sm text-foreground">
          You&apos;ve already applied to this event.
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
      ) : !submitted && !already ? (
        <form action={applyAction} className="rounded-lg border border-line bg-surface p-5">
          <p className="mb-4 text-sm text-foreground-soft">
            Applying as <strong className="text-foreground">{profile.fullName}</strong> using your saved profile.
          </p>
          <button
            type="submit"
            className="rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
          >
            Apply to attend
          </button>
        </form>
      ) : null}
    </main>
  );
}

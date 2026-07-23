import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { registrations } from "@/db/schema";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { StatusPill } from "@/components/status-pill";

export default async function ApplicationsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in?next=/applications");
  }

  // Every application in one place — status previously lived only on each
  // event's own apply page, so there was nowhere to see where you stand overall.
  const regs = await db.query.registrations.findMany({
    where: eq(registrations.userId, session.user.id),
    orderBy: [desc(registrations.appliedAt)],
    with: { event: true },
  });

  return (
    <PageShell>
      <PageHeader
        eyebrow="Your activity"
        title="Applications"
        subtitle="Every event you've applied to, and where each one stands."
      />

      {regs.length === 0 ? (
        <EmptyState
          eyebrow="Nothing yet"
          title="You haven't applied to any events yet."
          action={{ href: "/", label: "Discover events" }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {regs.map((reg) => (
            <Link
              key={reg.id}
              href={`/events/${reg.eventId}/apply`}
              className="flex items-start justify-between gap-4 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent/40 sm:p-5"
            >
              <div className="min-w-0 flex-1">
                <p className="mb-1 font-mono text-xs uppercase tracking-[0.1em] text-accent">
                  {reg.event.date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    timeZone: "America/New_York",
                  })}
                </p>
                <h2 className="font-serif text-lg font-semibold text-foreground">
                  {reg.event.title}
                </h2>
              </div>
              <StatusPill status={reg.status} />
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}

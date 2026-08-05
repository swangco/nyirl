import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { PageShell } from "@/components/page-shell";
import { ApplyForm } from "./apply-form";

export default async function ApplyPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in?next=/apply");
  }

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, session.user.id),
  });

  return (
    <PageShell width="narrow">
      <ApplyForm
        profile={profile ?? null}
        sessionName={session.user.name ?? ""}
        sessionEmail={session.user.email ?? ""}
      />
    </PageShell>
  );
}

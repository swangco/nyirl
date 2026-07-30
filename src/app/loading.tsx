import { ListSkeleton } from "@/components/card-skeleton";
import { PageShell } from "@/components/page-shell";

// Fallback loading state for any route that doesn't define its own — keeps the
// paper layout stable while the server component's DB queries + scoring resolve.
export default function Loading() {
  return (
    <PageShell>
      <div className="mb-8 space-y-3">
        <div className="h-3 w-20 animate-pulse rounded bg-line/50" />
        <div className="h-8 w-56 animate-pulse rounded bg-line/60" />
      </div>
      <ListSkeleton count={4} />
    </PageShell>
  );
}

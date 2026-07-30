// Loading placeholders that mirror ListingCard's rhythm, so async pages hold a
// stable editorial layout instead of flashing a blank frame.
export function CardSkeleton() {
  return (
    <div className="flex items-start gap-4 rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div className="h-14 w-14 shrink-0 animate-pulse rounded-md bg-line/50" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-line/50" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-line/60" />
        <div className="h-3 w-full animate-pulse rounded bg-line/40" />
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

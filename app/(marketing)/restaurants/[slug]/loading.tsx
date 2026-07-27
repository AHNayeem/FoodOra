/** Restaurant detail loading skeleton (Phase C5). */
export default function Loading() {
  return (
    <div className="pb-16">
      <div className="h-48 w-full animate-pulse bg-surface-muted sm:h-64 md:h-80" />
      <div className="container-site">
        <div className="relative -mt-14 flex gap-4 rounded-panel bg-surface p-5 shadow-card md:-mt-16 md:p-6">
          <div className="size-20 shrink-0 animate-pulse rounded-card bg-surface-muted md:size-24" />
          <div className="flex-1 space-y-3 pt-2">
            <div className="h-7 w-1/2 animate-pulse rounded-field bg-surface-muted" />
            <div className="h-4 w-3/4 animate-pulse rounded-field bg-surface-muted" />
          </div>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-card bg-surface-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}

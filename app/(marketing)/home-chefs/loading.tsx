/** Shared skeleton for the single-vertical directories. */
export default function Loading() {
  return (
    <div className="container-site py-8 md:py-12">
      <div className="mb-8 space-y-2">
        <div className="h-9 w-72 max-w-full animate-pulse rounded-field bg-surface-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-field bg-surface-muted" />
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-panel bg-surface-muted" />
        ))}
      </div>
      <div className="h-12 w-full animate-pulse rounded-pill bg-surface-muted" />
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-card bg-surface shadow-card">
            <div className="aspect-[16/10] animate-pulse bg-surface-muted" />
            <div className="space-y-2 p-4">
              <div className="h-5 w-3/4 animate-pulse rounded-field bg-surface-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded-field bg-surface-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

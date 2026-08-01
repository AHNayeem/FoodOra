/** Search loading skeleton — mirrors the sidebar + results layout. */
export default function Loading() {
  return (
    <div className="container-site py-8 md:py-12">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-72 max-w-full animate-pulse rounded-field bg-surface-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-field bg-surface-muted" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
        {/* Facet sidebar */}
        <div className="hidden flex-col gap-6 rounded-panel border border-line bg-surface p-5 lg:flex">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2.5">
              <div className="h-4 w-28 animate-pulse rounded-field bg-surface-muted" />
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 3 }).map((__, j) => (
                  <div key={j} className="h-9 w-20 animate-pulse rounded-pill bg-surface-muted" />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="min-w-0">
          <div className="h-13 w-full animate-pulse rounded-pill bg-surface-muted" />
          <div className="mt-4 flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 w-24 animate-pulse rounded-pill bg-surface-muted" />
            ))}
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
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
      </div>
    </div>
  );
}

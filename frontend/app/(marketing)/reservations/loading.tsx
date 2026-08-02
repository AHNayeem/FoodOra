/** Table-booking directory loading skeleton (Phase C16). */
export default function Loading() {
  return (
    <div className="pb-16">
      <div className="border-b border-line bg-surface-alt">
        <div className="container-site py-12 md:py-16">
          <div className="h-7 w-48 animate-pulse rounded-pill bg-surface-muted" />
          <div className="mt-4 h-10 w-2/3 max-w-lg animate-pulse rounded-field bg-surface-muted" />
          <div className="mt-3 h-5 w-96 max-w-full animate-pulse rounded-field bg-surface-muted" />
        </div>
      </div>
      <div className="container-site mt-10">
        <div className="h-12 w-full animate-pulse rounded-pill bg-surface-muted" />
        <div className="mt-4 flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="size-10 animate-pulse rounded-pill bg-surface-muted" />
          ))}
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-card bg-surface shadow-card">
              <div className="aspect-[16/9] animate-pulse bg-surface-muted" />
              <div className="space-y-2 p-4">
                <div className="h-5 w-3/4 animate-pulse rounded-field bg-surface-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded-field bg-surface-muted" />
                <div className="mt-4 flex gap-1.5">
                  {Array.from({ length: 4 }).map((__, j) => (
                    <div
                      key={j}
                      className="h-8 w-14 animate-pulse rounded-field bg-surface-muted"
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

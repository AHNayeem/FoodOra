/** Caterer detail loading skeleton (Phase C17). */
export default function Loading() {
  return (
    <div className="pb-16">
      <div className="aspect-[21/9] w-full animate-pulse bg-surface-muted md:aspect-[3/1]" />
      <div className="container-site">
        <div className="relative -mt-16 h-48 animate-pulse rounded-panel border border-line bg-surface shadow-card md:-mt-20" />
      </div>
      <div className="container-site mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
              <div className="aspect-[16/9] animate-pulse bg-surface-muted" />
              <div className="space-y-2 p-5">
                <div className="h-5 w-2/3 animate-pulse rounded-field bg-surface-muted" />
                <div className="h-4 w-full animate-pulse rounded-field bg-surface-muted" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-panel border border-line bg-surface" />
      </div>
    </div>
  );
}

import { Bike, Home, Store } from "lucide-react";
import { cn } from "@/frontend/lib/utils";

/**
 * TrackingMap — a stylised, self-contained "live map" for the tracker (Phase
 * C9). The prototype is frontend-only with no map/tiles provider, so this is a
 * CSS/SVG placeholder: a route from the restaurant to the destination with a
 * courier marker advancing along it by `fraction` (0..1). The track is pinned
 * LTR so the restaurant stays on the start side in every locale.
 */
export function TrackingMap({
  fraction,
  vendorName,
  destinationLabel,
  moving,
}: {
  fraction: number;
  vendorName: string;
  destinationLabel: string;
  moving: boolean;
}) {
  const pct = Math.min(100, Math.max(0, fraction * 100));

  return (
    <div className="relative h-56 overflow-hidden rounded-panel border border-line bg-surface-muted">
      {/* Faux map backdrop: soft blocks + street grid */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(0deg, rgba(120,140,120,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(120,140,120,0.10) 1px, transparent 1px), radial-gradient(circle at 20% 30%, rgba(120,180,120,0.18), transparent 45%), radial-gradient(circle at 80% 70%, rgba(120,160,200,0.16), transparent 45%)",
          backgroundSize: "28px 28px, 28px 28px, 100% 100%, 100% 100%",
        }}
      />

      {/* Route track (LTR-pinned) */}
      <div dir="ltr" className="absolute inset-x-8 top-1/2 -translate-y-1/2">
        {/* base line */}
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-pill bg-line" />
        {/* progress line */}
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-pill bg-primary transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />

        {/* Restaurant pin (start) */}
        <Pin side="start" chip="bg-fresh text-white" icon={Store} title={vendorName} />
        {/* Destination pin (end) */}
        <Pin side="end" chip="bg-primary text-white" icon={Home} title={destinationLabel} />

        {/* Courier marker */}
        <div
          className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-1000 ease-linear"
          style={{ left: `${pct}%` }}
        >
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-pill border-2 border-surface bg-ink text-white shadow-menu",
              moving && "motion-safe:animate-pop-in",
            )}
          >
            <Bike className="size-5" aria-hidden />
          </span>
          {moving && (
            <span className="absolute inset-0 -z-10 rounded-pill bg-ink/30 motion-safe:animate-ping" />
          )}
        </div>
      </div>
    </div>
  );
}

function Pin({
  icon: Icon,
  title,
  chip,
  side,
}: {
  icon: typeof Store;
  title: string;
  chip: string;
  side: "start" | "end";
}) {
  const isEnd = side === "end";
  return (
    <div
      className={cn(
        "absolute top-1/2 flex -translate-y-1/2 flex-col items-center gap-1",
        isEnd ? "-right-3" : "-left-3",
      )}
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-pill border-2 border-surface shadow-sm",
          chip,
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span
        className={cn(
          "absolute top-full mt-1 max-w-24 truncate rounded-pill bg-surface/90 px-2 py-0.5 text-[11px] font-medium text-ink shadow-sm",
          isEnd ? "right-0 text-end" : "left-0 text-start",
        )}
      >
        {title}
      </span>
    </div>
  );
}

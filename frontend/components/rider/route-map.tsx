"use client";

import { Bike, MapPin, Store } from "lucide-react";
import type { Coordinates, RiderTrack } from "@/types";
import { cn } from "@/lib/utils";

/**
 * RouteMap — a trip's stops and the courier on them, on a stylised map (Phase
 * C18; rider position shared since G38).
 *
 * The prototype has no tiles provider, so this is CSS and SVG — but the geometry
 * is real: stops are the vendors' and addresses' actual coordinates, projected
 * into the box by their own bounding box, with north up. A batch therefore looks
 * like the ride it is (out to two kitchens, then round the drops), and the line
 * the rider sees is the order the router chose rather than a decoration.
 *
 * The marker used to be this component's own idea — it sat on the last completed
 * stop, so a rider mid-ride was drawn standing at the kitchen they had already
 * left, and the customer's tracker said something different at the same moment.
 * It now renders `track.position`, the one fix `lib/rider-position` publishes for
 * this delivery, which is the same record the customer's map and the operations
 * desk are drawing. This component decides nothing about where the rider is; it
 * only projects.
 *
 * Pinned LTR: a map does not mirror in Arabic — east stays east.
 */
export function RouteMap({
  track,
  className,
}: {
  /** The delivery's route and the courier on it. */
  track: RiderTrack;
  className?: string;
}) {
  const { path, stops, completedStopIds, position } = track;

  const lats = path.map((p) => p.lat);
  const lngs = path.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  // Guard against a zero-size box (every stop at one point).
  const spanLat = Math.max(maxLat - minLat, 0.004);
  const spanLng = Math.max(maxLng - minLng, 0.004);

  /** Project a coordinate into the padded 0–100 box, north up. */
  const project = (p: Coordinates) => ({
    x: 10 + ((p.lng - minLng) / spanLng) * 80,
    y: 10 + (1 - (p.lat - minLat) / spanLat) * 80,
  });

  const done = new Set(completedStopIds);
  const points = path.map(project);
  const riderAt = project(position);
  const onRoute = position.phase !== "unassigned";

  /**
   * The part already ridden: every leg behind the courier plus the fraction of
   * the one they are on. Drawn to the courier's actual point rather than to the
   * last stop, so the solid line ends under the marker instead of behind it.
   */
  const ridden = onRoute
    ? [...points.slice(0, position.legIndex + 1), riderAt]
    : [];

  return (
    <div
      dir="ltr"
      className={cn(
        "relative h-64 overflow-hidden rounded-panel border border-line bg-surface-muted",
        className,
      )}
    >
      {/* Faux map backdrop: street grid + soft blocks, same language as the customer tracker */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(0deg, rgba(120,140,120,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(120,140,120,0.10) 1px, transparent 1px), radial-gradient(circle at 25% 25%, rgba(120,180,120,0.18), transparent 45%), radial-gradient(circle at 75% 70%, rgba(120,160,200,0.16), transparent 45%)",
          backgroundSize: "26px 26px, 26px 26px, 100% 100%, 100% 100%",
        }}
      />

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        aria-hidden
      >
        {/* Whole route */}
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          className="text-line"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeDasharray="3 2"
          vectorEffect="non-scaling-stroke"
        />
        {/* The part already ridden */}
        {ridden.length > 1 && (
          <polyline
            points={ridden.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="currentColor"
            className="text-primary"
            strokeWidth={2}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Stop pins */}
      {stops.map((stop, i) => {
        const p = points[i + 1];
        const isDone = done.has(stop.id);
        return (
          <div
            key={stop.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-pill border-2 border-surface text-white shadow-card",
                isDone
                  ? "bg-muted"
                  : stop.kind === "pickup"
                    ? "bg-fresh"
                    : "bg-primary",
              )}
              title={stop.name}
            >
              {stop.kind === "pickup" ? (
                <Store className="size-4" aria-hidden />
              ) : (
                <MapPin className="size-4" aria-hidden />
              )}
            </span>
            <span className="absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-pill bg-ink text-[0.5625rem] font-bold text-white">
              {stop.sequence + 1}
            </span>
          </div>
        );
      })}

      {/* The rider. Absent until there is one — an undispatched route is a plan,
          not a courier standing at the kitchen. */}
      {onRoute && (
        <div
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-1000 ease-linear"
          style={{ left: `${riderAt.x}%`, top: `${riderAt.y}%` }}
        >
          <span className="flex size-9 items-center justify-center rounded-pill border-2 border-surface bg-ink text-white shadow-menu">
            <Bike className="size-4.5" aria-hidden />
          </span>
          {/* Pings only while genuinely moving — a marker that pulses at a closed
              door reads as a rider who is still coming. */}
          {position.moving && (
            <span className="absolute inset-0 -z-10 rounded-pill bg-ink/30 motion-safe:animate-ping" />
          )}
        </div>
      )}
    </div>
  );
}

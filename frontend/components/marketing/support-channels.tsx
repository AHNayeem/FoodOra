"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { SupportChannel } from "@/types";
import { useCmsSupportChannels } from "@/components/cms/use-cms-content";
import { DashIcon } from "@/components/directory/dash-icon";

/**
 * SupportChannels — the "talk to someone" cards.
 *
 * One component for `/help` and `/contact`, because a channel is the same row on
 * both (`toSupportChannels`). `source` says which page document to re-read after
 * an edit; `contact` passes its own rows in and needs no lookup.
 */
export function SupportChannels({
  channels,
  source = "help",
}: {
  channels: SupportChannel[];
  source?: "help" | "given";
}) {
  const fromHelp = useCmsSupportChannels(channels);
  const list = source === "help" ? fromHelp : channels;

  if (list.length === 0) return null;

  return (
    <ul className="grid gap-6 sm:grid-cols-2">
      {list.map((channel) => {
        const external = !channel.href.startsWith("/");
        return (
          <li
            key={channel.title}
            className="flex flex-col rounded-panel border border-line bg-surface p-6"
          >
            <span className="inline-flex size-11 items-center justify-center rounded-pill bg-primary/10 text-primary">
              <DashIcon name={channel.icon} className="size-5" />
            </span>
            <h3 className="mt-4 text-lg font-bold text-ink">{channel.title}</h3>
            <p className="mt-2 flex-1 text-body">{channel.description}</p>
            {channel.availability && (
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                {channel.availability}
              </p>
            )}
            {channel.actionLabel &&
              (external ? (
                <a
                  href={channel.href}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  {channel.actionLabel}
                  <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
                </a>
              ) : (
                <Link
                  href={channel.href}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  {channel.actionLabel}
                  <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
                </Link>
              ))}
          </li>
        );
      })}
    </ul>
  );
}

"use client";

// The sample-data indicator every preview page carries, with the developer
// controls on the right when the surface has any.
//
// This is not decoration. Every number, name and message in this app is
// synthetic, and a preview that looks like production is how a fixture ends up
// quoted as a real balance. It sits inside the page rather than in the shell so
// it lines up with the page's own content in both centred and full-bleed
// layouts.

import type { ReactNode } from "react";
import { PreviewBadge } from "./PreviewChrome";

export default function PreviewNotice({
  controls,
  sourceLabel = "Sample data",
  detail = "Every value is synthetic. Nothing here reaches a provider, an account, a session or a stored record.",
}: {
  controls?: ReactNode;
  sourceLabel?: string;
  detail?: string;
}) {
  return (
    <div
      data-of-preview-notice
      className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <PreviewBadge sourceLabel={sourceLabel} />
        <span className="text-[11px] leading-4 text-muted">{detail}</span>
      </div>
      {controls}
    </div>
  );
}

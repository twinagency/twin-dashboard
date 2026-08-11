// Who filed it. One definition of each bot's name, colour and mark, shared by
// the tracker rows and the bots settings page, so a bot looks the same
// everywhere and you can tell at a glance which one found something.
//
// A human reporter (ronan, jesse, anyone typing into the form) gets no badge at
// all. The badge means "a machine filed this", which is exactly the thing worth
// spotting on a row.

export type BotIdentity = {
  slug: string;
  label: string;
  /** Tailwind classes for the badge: background, text, ring. */
  chip: string;
  /** Solid colour for the avatar disc. */
  disc: string;
  /** Inner SVG for the mark, drawn on a 24x24 viewBox, stroke currentColor. */
  mark: string;
  tagline: string;
};

export const BOTS: Record<string, BotIdentity> = {
  // An ear. It listens to conversations and tells on them.
  snitch: {
    slug: "snitch",
    label: "Snitch",
    chip: "bg-rose-100 text-rose-700",
    disc: "bg-rose-500",
    mark: '<path d="M6 8.5a6 6 0 0 1 12 0c0 4-3 5-3 8a3 3 0 0 1-6 0"/><path d="M9 9a3 3 0 0 1 6 0"/>',
    tagline: "reads the messages",
  },
  // A magnifier over a fork in the road: it decides which way a fix goes.
  triage: {
    slug: "triage",
    label: "Triage",
    chip: "bg-amber-100 text-amber-700",
    disc: "bg-amber-500",
    mark: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="M15 15l5 5"/><path d="M8 10.5h5"/>',
    tagline: "config or code",
  },
  // Scales. It weighs the money.
  ledger: {
    slug: "ledger",
    label: "Ledger",
    chip: "bg-emerald-100 text-emerald-700",
    disc: "bg-emerald-600",
    mark: '<path d="M12 4v16"/><path d="M6 8h12"/><path d="M6 8l-3 6h6z"/><path d="M18 8l-3 6h6z"/>',
    tagline: "proves it from the rows",
  },
  // A flask: it reproduces the thing in a jar so you can watch it fail.
  repro: {
    slug: "repro",
    label: "Repro",
    chip: "bg-violet-100 text-violet-700",
    disc: "bg-violet-500",
    mark: '<path d="M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M9 3h6"/><path d="M7.5 14h9"/>',
    tagline: "writes the failing test",
  },
  // A shield. It watches the boxes.
  warden: {
    slug: "warden",
    label: "Warden",
    chip: "bg-sky-100 text-sky-700",
    disc: "bg-sky-600",
    mark: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    tagline: "watches the boxes",
  },
};

export function botFor(submittedBy: string): BotIdentity | null {
  return BOTS[submittedBy?.toLowerCase()] ?? null;
}

export function BotMark({ bot, className = "h-4 w-4" }: { bot: BotIdentity; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      dangerouslySetInnerHTML={{ __html: bot.mark }}
    />
  );
}

/** The row badge: disc + name, small enough to sit inline on a list row. */
export function BotBadge({ bot, size = "sm" }: { bot: BotIdentity; size?: "sm" | "lg" }) {
  if (size === "lg") {
    return (
      <span className="inline-flex items-center gap-2">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-white ${bot.disc}`}>
          <BotMark bot={bot} className="h-5 w-5" />
        </span>
        <span className="text-base font-semibold text-neutral-900">{bot.label}</span>
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-[11px] font-semibold ${bot.chip}`}>
      <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-white ${bot.disc}`}>
        <BotMark bot={bot} className="h-2.5 w-2.5" />
      </span>
      {bot.label}
    </span>
  );
}

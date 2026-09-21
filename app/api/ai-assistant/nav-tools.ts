// Navigation the assistant can do FOR you: "open the logs", "show me Aria's
// settings", "take me to earnings".
//
// This is the one tool family that does NOT execute on the server. The server
// only decides WHERE, emits a `navigate` event on the SSE stream, and the
// browser does the actual routing (see components/TwinPanel.tsx). That split is
// deliberate: a route change is a client concern, and keeping it out of the
// write path means it can never be confused with a database write in the
// approval gate below it.
//
// Opening a page is not gated behind approval. It changes nothing, it is
// instantly obvious, and it is undone by pressing Back. The approval gate
// (see route.ts) exists for writes that touch live bot config and fan records.

/** Every page the assistant is allowed to send you to, with what it is for. */
export const NAV_TARGETS: { path: string; label: string; what: string }[] = [
  { path: "/", label: "Overview", what: "the fleet-wide home dashboard" },
  { path: "/revenue", label: "Earnings", what: "revenue, Star income, top spenders" },
  { path: "/sales-health", label: "Sales Health", what: "conversation-led offer delivery, purchases, block reasons, and inventory readiness" },
  { path: "/users", label: "Fans", what: "the fan list across every clone" },
  { path: "/messages", label: "Messages", what: "conversation history with fans" },
  { path: "/clones", label: "Clones", what: "the list of clones (girls)" },
  { path: "/media", label: "Media", what: "the photo/video library" },
  { path: "/flows", label: "Flows", what: "the per-clone conversation flow builder" },
  { path: "/drip", label: "Drip", what: "drip/campaign scheduling" },
  { path: "/analytics", label: "Analytics", what: "charts and trends" },
  { path: "/logs", label: "Logs", what: "system logs and recent errors" },
  { path: "/info", label: "Info", what: "reference and documentation" },
  { path: "/settings", label: "Settings", what: "global dashboard settings" },
];

/** Tabs that live on a clone's own page, reached as /clones/<id>?tab=<tab>. */
export const CLONE_TABS = ["identity", "ppvs", "media", "paywall", "onboarding"] as const;

const NAV_PATHS = new Set(NAV_TARGETS.map((t) => t.path));

export const NAV_TOOL_NAMES = new Set(["openPage", "openClonePage"]);

/**
 * Resolve a navigation tool call to a concrete in-app path.
 *
 * Returns a plain object either way — never throws — because this runs inside
 * the model's tool loop and a thrown error there costs the whole turn. A bad
 * path comes back as an `error` the model can read and correct.
 *
 * SECURITY NOTE: `page` is matched against NAV_PATHS by exact equality, never
 * concatenated or pattern-matched. That is what stops a model-authored string
 * from becoming an open redirect ("//evil.com" is a valid relative URL to a
 * browser, and router.push would happily follow it).
 */
export function resolveNavTool(name: string, args: Record<string, unknown>): { path?: string; label?: string; error?: string } {
  if (name === "openPage") {
    const page = typeof args.page === "string" ? args.page.trim() : "";
    if (!NAV_PATHS.has(page)) {
      return { error: `"${page}" is not a page I can open. Allowed: ${[...NAV_PATHS].join(", ")}` };
    }
    return { path: page, label: NAV_TARGETS.find((t) => t.path === page)?.label ?? page };
  }

  if (name === "openClonePage") {
    const cloneId = typeof args.cloneId === "string" ? args.cloneId.trim() : "";
    // UUID only. A name would have to be resolved against the database, and
    // this module deliberately does no I/O — the model has queryTable for that
    // and is told to look the id up first.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cloneId)) {
      return { error: "openClonePage needs the clone's UUID. Look it up with queryTable on clones first." };
    }
    const tab = typeof args.tab === "string" ? args.tab.trim() : "";
    if (tab && !CLONE_TABS.includes(tab as (typeof CLONE_TABS)[number])) {
      return { error: `"${tab}" is not a clone tab. Allowed: ${CLONE_TABS.join(", ")}` };
    }
    return { path: `/clones/${cloneId}${tab ? `?tab=${tab}` : ""}`, label: tab ? `clone ${tab}` : "clone page" };
  }

  return { error: `unknown navigation tool: ${name}` };
}

export const NAV_TOOL_DEFS = [
  {
    type: "function" as const,
    function: {
      name: "openPage",
      description:
        "Open one of the dashboard's pages in the operator's browser, right now. Use this whenever they ask to " +
        "see, open, go to, or be shown a section, and also when your answer is really 'go look at X' - open it " +
        "instead of describing where it is. Changes nothing, so no confirmation is needed. Pages: " +
        NAV_TARGETS.map((t) => `${t.path} (${t.what})`).join("; "),
      parameters: {
        type: "object",
        properties: {
          page: { type: "string", enum: NAV_TARGETS.map((t) => t.path) },
        },
        required: ["page"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "openClonePage",
      description:
        "Open one specific clone's own page, optionally on a given tab. Needs the clone's UUID - if you only " +
        "have a name, call queryTable on clones to get the id first.",
      parameters: {
        type: "object",
        properties: {
          cloneId: { type: "string", description: "The clone's clones.id UUID." },
          tab: { type: "string", enum: [...CLONE_TABS], description: "Optional tab to land on." },
        },
        required: ["cloneId"],
      },
    },
  },
];

// Derives the TopBar's "{scope} / {page}" breadcrumb from the current path,
// the global clone list, and the global clone-scope switcher. Pure function so
// layout.tsx and TopBar.tsx (and tests, if any land later) can share one
// definition of what each route is called — see dashboard/app/layout.tsx for
// how this feeds TopBar.

// scopeIsCreator says whether scopeLabel is a real creator's name ("Kate") or a
// generic scope word ("All clones", "New clone"). TopBar only tags the former
// with .creator-name, so privacy mode blurs the name and leaves "All clones"
// readable.
export type PageMeta = { scopeLabel: string; pageLabel: string | null; scopeIsCreator: boolean };

type CloneLite = { id: string; name: string };

// Exact-route → human label. Anything not listed falls back to "Dashboard"
// rather than crashing or showing a raw path segment.
const PAGE_LABELS: Record<string, string> = {
  "/revenue": "Earnings",
  "/users": "Fans",
  "/flows": "Flows",
  "/jarvis": "AI",
  "/info": "Info",
  "/logs": "Logs",
  "/tracker": "Tracker",
  "/media": "Media",
  "/sim": "Sim",
  "/clones": "Creators",
  "/settings": "Settings",
  "/agency-admin": "Agency access",
  "/agency-admin/creator-codes": "Creator invites",
  "/crm/inbox": "Inbox",
  "/crm/fans": "Fan CRM",
  "/crm/campaigns": "Campaigns",
  "/campaigns": "Campaigns",
  "/crm/team": "Team",
  "/crm/platforms": "Platforms",
  "/admin/submissions": "New Form Submissions",
  "/admin/clients": "Client Database",
  "/admin/todo": "Team To Do",
};

export function getPageMeta(
  pathname: string | null,
  clones: CloneLite[],
  activeCloneId: string | null,
): PageMeta {
  const path = pathname ?? "";

  // /clones/new: brand-new clone being drafted, nothing to show after the slash.
  if (path === "/clones/new") {
    return { scopeLabel: "New creator", pageLabel: null, scopeIsCreator: false };
  }

  // /clones/[id] and /clones/[id]/fans/[userId]: the "scope" here is the clone
  // being edited (from the URL), not the global switcher's activeCloneId.
  const cloneEditMatch = path.match(/^\/clones\/([^/]+)/);
  if (cloneEditMatch) {
    const id = cloneEditMatch[1];
    const clone = clones.find((c) => c.id === id);
    const isFanSubRoute = /^\/clones\/[^/]+\/fans\/[^/]+/.test(path);
    return {
      scopeLabel: clone?.name ?? "Creator",
      pageLabel: isFanSubRoute ? "Edit / Fan" : "Edit",
      scopeIsCreator: clone != null,
    };
  }

  const globalScope = activeCloneId ? clones.find((c) => c.id === activeCloneId)?.name : null;
  return {
    scopeLabel: globalScope ?? "All creators",
    pageLabel: PAGE_LABELS[path] ?? "Dashboard",
    scopeIsCreator: globalScope != null,
  };
}



// Derives the TopBar's "{scope} / {page}" breadcrumb from the current path,
// the global clone list, and the global clone-scope switcher. Pure function so
// layout.tsx and TopBar.tsx (and tests, if any land later) can share one
// definition of what each route is called — see dashboard/app/layout.tsx for
// how this feeds TopBar.

export type PageMeta = { scopeLabel: string; pageLabel: string | null };

type CloneLite = { id: string; name: string };

// Exact-route → human label. Anything not listed falls back to "Dashboard"
// rather than crashing or showing a raw path segment.
const PAGE_LABELS: Record<string, string> = {
  "/revenue": "Earnings",
  "/users": "Fans",
  "/drip": "Campaigns",
  "/info": "Info",
  "/logs": "Logs",
  "/media": "Media",
  "/clones": "Clones",
  "/settings": "Settings",
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
    return { scopeLabel: "New clone", pageLabel: null };
  }

  // /clones/[id] and /clones/[id]/fans/[userId]: the "scope" here is the clone
  // being edited (from the URL), not the global switcher's activeCloneId.
  const cloneEditMatch = path.match(/^\/clones\/([^/]+)/);
  if (cloneEditMatch) {
    const id = cloneEditMatch[1];
    const clone = clones.find((c) => c.id === id);
    const isFanSubRoute = /^\/clones\/[^/]+\/fans\/[^/]+/.test(path);
    return {
      scopeLabel: clone?.name ?? "Clone",
      pageLabel: isFanSubRoute ? "Edit / Fan" : "Edit",
    };
  }

  const globalScope = activeCloneId ? clones.find((c) => c.id === activeCloneId)?.name : null;
  return {
    scopeLabel: globalScope ?? "All clones",
    pageLabel: PAGE_LABELS[path] ?? "Dashboard",
  };
}

const WORKSPACE_PAGE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard", "/clones": "Creators", "/fans": "Fan Profiles",
  "/inbox": "Inbox", "/content-library": "Content Library", "/campaigns": "Campaigns",
  "/users": "Live Telegram Window", "/business": "Telegram Stories",
  "/flows": "Flows", "/sequences": "Sequences", "/revenue": "Earnings",
  "/sales-health": "Sales Health", "/catalogue-funnel": "Catalogue Funnel",
  "/agency-admin": "Agency Access", "/agency-admin/creator-codes": "Invitations",
  "/agency/creators": "Creator Onboarding", "/agency/creator-invites": "Creator Invitations",
  "/creator-management": "Creator Onboarding", "/jarvis": "Core Intelligence",
  "/ai-models": "AI Models", "/settings": "Settings", "/admin/earnings-split": "Earnings Split",
  "/storage": "Storage", "/logs": "Activity Logs", "/api-access": "API Access",
  "/sim": "Simulator", "/bot-v2": "Bot V2", "/miniapp-rollout": "Mini App Rollout",
  "/mtproto-campaign": "MTProto Campaigns", "/mtproto-campaign/new": "New Campaign",
  "/mtproto-campaign/connections": "Campaign Connections", "/mtproto-campaign/media": "Campaign Media",
  "/mtproto-campaign/settings": "Campaign Settings", "/tracker": "Tracker",
  "/info": "Connection Details", "/tsocial": "Telegram Social", "/admin/view-as": "View As",
  "/analytics": "Analytics", "/media": "Media", "/drip": "Drip sequences",
  "/messages": "Messages", "/crm": "CRM", "/ai": "AI Assistant",
  "/agency/creator-split": "Creator earnings split",
};

export function dashboardWorkspacePageLabel(pathname: string): string | null {
  const exact = WORKSPACE_PAGE_LABELS[pathname];
  if (exact) return exact;
  const parent = Object.keys(WORKSPACE_PAGE_LABELS).sort((a, b) => b.length - a.length).find(path => pathname.startsWith(path + "/"));
  return parent ? WORKSPACE_PAGE_LABELS[parent] : null;
}


// Presentation only. The server and verified membership still decide which
// destinations and records an operator can access. Demo controls have their
// own audience/creator gate and do not participate in this layout decision.
export function isDashboardWorkspaceRoute(pathname: string): boolean {
  return dashboardWorkspacePageLabel(pathname) !== null;
}

export function isCreatorStudioRoute(pathname: string): boolean {
  return /^\/clones\/[0-9a-f-]{36}\/?$/i.test(pathname);
}


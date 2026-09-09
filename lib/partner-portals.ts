/** Public portal branding. Access still comes from verified database membership. */
export const JESS_KATE_PORTAL = {
  id: "40563447-698f-4ec2-b175-c816f877a1f6",
  name: "Jess and Kate AI",
  slug: "jess-and-kate-ai",
  loginPath: "/jess-and-kate-ai",
  loginEmail: "jess-and-kate-ai@dashboard.tgaiclone.xyz",
} as const;
export const PARTNER_PORTALS = [
  { id: "74b03b70-397e-49ab-841f-8adb8241d87d", name: "LYNQ", slug: "lynq", loginPath: "/link", aliases: ["/lynq"] },
  { id: "bc670215-110b-4ea0-8f5c-af3dfe21d253", name: "Moxy", slug: "moxy", loginPath: "/moxy", aliases: [] },
  { ...JESS_KATE_PORTAL, aliases: [] },
] as const;
export function portalForPath(path: string) {
  return PARTNER_PORTALS.find(portal => [portal.loginPath, ...portal.aliases].some(prefix => path === prefix || path.startsWith(prefix + "/")));
}

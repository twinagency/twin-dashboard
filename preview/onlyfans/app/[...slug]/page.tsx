import PreviewNotice from "@/components/onlyfans-preview/PreviewNotice";
import { SurfaceNote } from "@/components/onlyfans-preview/SurfaceNote";
import { getPageMeta } from "@/lib/page-meta";

// Every other dashboard route the sidebar links to.
//
// The preview mounts the real Sidebar, so its links point at the real routes.
// This catch-all answers them with the page's own name instead of a 404, and
// says plainly that the screen itself lives in the dashboard. The alternative —
// a sidebar whose links all break — would be a worse lie than a named note.
export default async function ExistingDashboardRoute({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const pathname = `/${(slug ?? []).join("/")}`;
  const meta = getPageMeta(pathname, [], null);
  const label = meta.pageLabel && meta.pageLabel !== "Dashboard" ? meta.pageLabel : pathname;

  return (
    <>
      <PreviewNotice />
      <SurfaceNote
        label={label}
        availability="existing"
        note="This screen already ships in the Twin dashboard and is not part of OF-D0. The preview mounts the real navigation, so this route is reachable; the screen behind it is not reproduced here and nothing on it is loaded."
        route={pathname}
      />
    </>
  );
}

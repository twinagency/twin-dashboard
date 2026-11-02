import type { ViewAsBannerInfo } from "@/lib/view-as-banner";

// Fixed, unmissable, on every page while a view-as cookie is live. Plain form
// POST to the Route Handler (not a server action) so it works from any page
// and is exempt from middleware.ts's own read-only block by path.
export default function ViewAsBanner({ info }: { info: ViewAsBannerInfo }) {
  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2147483000,
        background: "#dc2626",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 16px",
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      <span>
        Viewing as {info.name} ({info.kind}), read-only
      </span>
      <form action="/admin/view-as/exit" method="post">
        <button
          type="submit"
          style={{
            background: "#fff",
            color: "#dc2626",
            border: "none",
            borderRadius: 6,
            padding: "4px 12px",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Exit
        </button>
      </form>
    </div>
  );
}

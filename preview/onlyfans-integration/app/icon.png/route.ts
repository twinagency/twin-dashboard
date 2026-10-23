import { servePublic } from "../../lib/static-assets";

export const dynamic = "force-dynamic";

export async function GET() {
  return servePublic(["icon.png"]);
}

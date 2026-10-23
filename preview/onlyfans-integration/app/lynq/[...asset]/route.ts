import { servePublic } from "../../../lib/static-assets";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ asset: string[] }> }) {
  return servePublic(["lynq", ...(await context.params).asset]);
}

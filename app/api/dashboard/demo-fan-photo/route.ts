export const dynamic = "force-dynamic";
// The presentation has been retired; its private media is no longer served.
export function GET() {
  return new Response("Not found", { status: 410, headers: { "Cache-Control": "private, no-store" } });
}

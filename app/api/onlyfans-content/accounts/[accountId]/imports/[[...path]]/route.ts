import { NextRequest } from "next/server";
import { handleImportRead, handleImportWrite, type ImportContext } from "@/lib/onlyfans/offer-import-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: NextRequest, context: ImportContext) => handleImportRead(request, context);
export const POST = (request: NextRequest, context: ImportContext) => handleImportWrite(request, context);

import { NextResponse, type NextRequest } from "next/server";
import { getDashboardAccess, withDashboardAccess } from "./dashboard-access";
export function dashboardReader(handler:(req:NextRequest)=>Promise<Response>) {
  return async (req:NextRequest):Promise<Response> => {
    try {
      const access=await getDashboardAccess();
      return await withDashboardAccess(access,()=>handler(req));
    } catch {
      return NextResponse.json({error:"Dashboard access unavailable. Please sign in again."},{status:403});
    }
  };
}

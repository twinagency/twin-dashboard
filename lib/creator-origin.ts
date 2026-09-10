import { dashboardOrigin } from "./form-origin";

export function creatorRequestUrl(req: Request, path: string): URL {
  return new URL(path, dashboardOrigin(req));
}

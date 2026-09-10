import { handleCreatorReportRequest } from '@/lib/creator-report-controller';
import { requireCreatorReportIdentity, loadCreatorReport } from '@/lib/creator-reporting';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// This route verifies the creator itself. It does not rely on the middleware
// or inherit the administrator development bypass. No write methods exist.
export function GET(request: Request) {
  return handleCreatorReportRequest(request, requireCreatorReportIdentity, loadCreatorReport);
}
export const HEAD = GET;

import {
  CreatorReportError, creatorTransactionsCsv, parseCreatorReportQuery,
  type CreatorReportIdentity, type CreatorReportQuery, type CreatorReportResponse,
} from './creator-report-contract';

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Vary': 'Cookie',
  'X-Content-Type-Options': 'nosniff',
};
/** Dependency injection keeps boundary tests offline and exercises the real handler. */
export async function handleCreatorReportRequest(
  request: Request,
  authorize: () => Promise<CreatorReportIdentity>,
  load: (identity: CreatorReportIdentity, query: CreatorReportQuery) => Promise<CreatorReportResponse>,
): Promise<Response> {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { ...PRIVATE_HEADERS, Allow: 'GET, HEAD' } });
    }
    const identity = await authorize();
    const query = parseCreatorReportQuery(new URL(request.url).searchParams);
    const result = await load(identity, query);
    if (query.format === 'csv') {
      if (result.state !== 'ready') throw new CreatorReportError(409, 'Your clone is not connected yet.');
      return new Response(request.method === 'HEAD' ? null : creatorTransactionsCsv(result.report), {
        headers: { ...PRIVATE_HEADERS, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="twin-creator-latest-transactions.csv"' },
      });
    }
    return new Response(request.method === 'HEAD' ? null : JSON.stringify(result), {
      headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const status = error instanceof CreatorReportError ? error.status : 503;
    const message = error instanceof CreatorReportError ? error.message : 'Your report is temporarily unavailable. Please try again.';
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({ error: message }), {
      status, headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}

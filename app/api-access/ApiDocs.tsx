import { PUBLIC_FAN_COLUMNS } from "@/lib/api-public";
import { RATE_LIMIT_PER_MINUTE } from "@/lib/api-tenant";

// Docs rendered from the SAME constants the API enforces, not from a copy.
// A hand-written field list here would drift from lib/api-public.ts the first
// time someone edits one and not the other, and the docs are exactly the
// artefact nobody re-reads to check.

function Endpoint({ method, path, children }: { method: string; path: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line/60 py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="rounded bg-good/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-good">{method}</span>
        <code className="font-mono text-[12px] text-ink">{path}</code>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

export function ApiDocs() {
  return (
    <div className="space-y-5 text-sm">
      <section>
        <h3 className="mb-1 font-semibold text-ink">Authentication</h3>
        <p className="text-[12px] leading-relaxed text-muted">
          Send the key as a bearer token on every request. It is never accepted in the URL, because keys in URLs end
          up in server logs and browser history.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-panel p-3 font-mono text-[11px] leading-relaxed text-ink">
{`curl -H "Authorization: Bearer YOUR_KEY" \\
     https://your-dashboard-host/api/v1/me`}
        </pre>
      </section>

      <section>
        <h3 className="mb-1 font-semibold text-ink">Endpoints</h3>
        <div className="rounded-lg border border-line px-3">
          <Endpoint method="GET" path="/api/v1/me">
            Which model this key belongs to. Call it first to label the dashboard.
          </Endpoint>
          <Endpoint method="GET" path="/api/v1/revenue?period=1M">
            Revenue for the window. <code className="font-mono">period</code> is one of ALL, 1Y, 6M, 3M, 1M, 2W, 1W,
            1D. Or pass <code className="font-mono">start</code> and <code className="font-mono">end</code> as
            epoch milliseconds for a custom range (both are required together). Returns totals, a daily series, and
            breakdowns by kind, feature, hour, day of week and spend tier, plus the fan and paywall funnels.
          </Endpoint>
          <Endpoint method="GET" path="/api/v1/fans?limit=100">
            This model&apos;s fans, highest lifetime spend first. Max 500 per call.
          </Endpoint>
        </div>
      </section>

      <section>
        <h3 className="mb-1 font-semibold text-ink">Fan fields</h3>
        <p className="mb-2 text-[12px] leading-relaxed text-muted">
          Exactly these, nothing else. No message content is available on this API at any parameter.
        </p>
        <div className="flex flex-wrap gap-1">
          {PUBLIC_FAN_COLUMNS.map((c) => (
            <code key={c} className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[11px] text-ink">
              {c}
            </code>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1 font-semibold text-ink">What a key cannot reach</h3>
        <ul className="list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-muted">
          <li>Any other model. Passing a clone parameter is rejected, not ignored.</li>
          <li>Chat messages, prompts, persona or config of any kind.</li>
          <li>Our AI costs, profit or margin. Those are never in the response.</li>
          <li>Anything at all after it is revoked, from the very next request.</li>
        </ul>
      </section>

      <section>
        <h3 className="mb-1 font-semibold text-ink">Limits and errors</h3>
        <ul className="list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-muted">
          <li>
            {RATE_LIMIT_PER_MINUTE} requests per minute per key. Over that returns{" "}
            <code className="font-mono">429</code> with a <code className="font-mono">Retry-After</code> header. Cache
            on your side rather than polling in a render loop.
          </li>
          <li>
            <code className="font-mono">401</code> invalid or revoked key. <code className="font-mono">400</code> a bad
            parameter, with a sentence saying which.
          </li>
          <li>
            Every response is <code className="font-mono">{`{ ok: true, version: "v1", … }`}</code>, or{" "}
            <code className="font-mono">{`{ ok: false, error }`}</code>. Check <code className="font-mono">ok</code>,
            not the shape.
          </li>
        </ul>
      </section>

      <section>
        <h3 className="mb-1 font-semibold text-ink">Building without real data</h3>
        <p className="text-[12px] leading-relaxed text-muted">
          There are matching endpoints that return generated data in exactly these shapes, so a dashboard can be built
          and demoed before a key is handed out, then repointed by changing the URL alone. They read and write nothing.
          Ask for the internal sim endpoints; they are not reachable with a model key.
        </p>
      </section>
    </div>
  );
}

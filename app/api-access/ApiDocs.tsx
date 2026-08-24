import { PUBLIC_FAN_COLUMNS, PUBLIC_FLEET_FAN_COLUMNS } from "@/lib/api-public";
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
        <h3 className="mb-1 font-semibold text-ink">Two kinds of key</h3>
        <p className="text-[12px] leading-relaxed text-muted">
          The endpoints below are the same for both. What changes is how much a key can see, and that is fixed when
          the key is created. It cannot be widened by anything the caller sends.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-muted">
          <li>
            <strong className="text-ink">One model.</strong> Revenue and fans for that girl only.
          </li>
          <li>
            <strong className="text-ink">All models.</strong> The same responses, covering every girl. Revenue adds a{" "}
            <code className="font-mono">models</code> array, one entry per girl, ranked by revenue. Fans adds a{" "}
            <code className="font-mono">clone_id</code> to each row so they can be grouped. This is the one to hand to
            an outside dashboard builder, so they need one key and one URL rather than ten.
          </li>
        </ul>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Call <code className="font-mono">/api/v1/me</code> to find out which one you are holding. It returns{" "}
          <code className="font-mono">scope</code> as either <code className="font-mono">&quot;clone&quot;</code> or{" "}
          <code className="font-mono">&quot;fleet&quot;</code>. Branch on that, not on whether a field happens to be
          present.
        </p>
      </section>

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
            What this key can see. Returns <code className="font-mono">scope</code>, plus{" "}
            <code className="font-mono">model</code> for a one model key or <code className="font-mono">models</code>{" "}
            for an All models key. Call it first to label the dashboard.
          </Endpoint>
          <Endpoint method="GET" path="/api/v1/revenue?period=1M">
            Revenue for the window. <code className="font-mono">period</code> is one of ALL, 1Y, 6M, 3M, 1M, 2W, 1W,
            1D. Or pass <code className="font-mono">start</code> and <code className="font-mono">end</code> as
            epoch milliseconds for a custom range (both are required together). Returns totals, a daily series, and
            breakdowns by kind, feature, hour, day of week and spend tier, plus the fan and paywall funnels. An All
            models key additionally returns <code className="font-mono">models</code>, with{" "}
            <code className="font-mono">id</code>, <code className="font-mono">name</code>,{" "}
            <code className="font-mono">revenueStars</code> and <code className="font-mono">sales</code> per girl.
          </Endpoint>
          <Endpoint method="GET" path="/api/v1/fans?limit=100">
            Fans, highest lifetime spend first. Max 500 per call. One model key returns that girl&apos;s fans; an All
            models key returns the top spenders across the fleet, each row carrying its{" "}
            <code className="font-mono">clone_id</code>. The <code className="font-mono">fields</code> array in the
            response names the columns you actually got.
          </Endpoint>
        </div>
      </section>

      <section>
        <h3 className="mb-1 font-semibold text-ink">Fan fields</h3>
        <p className="mb-2 text-[12px] leading-relaxed text-muted">
          Exactly these, nothing else. No message content is available on this API at any parameter. An All models key
          gets one extra field, <code className="font-mono">{PUBLIC_FLEET_FAN_COLUMNS[0]}</code>, and nothing further.
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
          <li>
            Any model the key was not issued for. Passing a clone parameter is rejected, not ignored, at either scope.
          </li>
          <li>Chat messages, prompts, persona or config of any kind.</li>
          <li>
            Our AI costs, profit or margin. Those are never in the response, and an All models key does not change
            that: it widens which girls you can see, never what you can see about them.
          </li>
          <li>Anything at all after it is revoked, from the very next request.</li>
          <li>Any write. There is no endpoint on this API that changes anything.</li>
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

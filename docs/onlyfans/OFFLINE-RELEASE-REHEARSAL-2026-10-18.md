# Offline rehearsal and demo — 18 October 2026

The current backend document of the same name contains the historical data map,
writer exclusion register, recovery/capacity limits and complete prerequisites.
Database schema remains `0078_operator_controls`.

After applying the cumulative patches to sibling checkouts and installing the
test dependencies/browser, export a disposable loopback PostgreSQL test URL as
`ONLYFANS_TEST_PG_URL`. From the backend root, run:

```sh
.venv/bin/python service/tests/onlyfans_demo.py --dashboard ../twin-dashboard --smoke
```

This starts the real API and isolated Next harness, creates its own synthetic
database and credentials, runs all five local controls, loses/retries an
acknowledgement, checks unresolved holds and session loss, and opens native
Content/Sales/Settings plus Operations on desktop/mobile. It verifies currency
and status totals, unpaid offers, saved configuration, private-data removal and
zero external browser requests. Then it shuts down and removes its database.

Omit `--smoke` for an interactive local UI with a fresh local login link.
Ctrl-C performs the same shutdown/cleanup. This test-only harness is separate
from the production dashboard; its login route and neutral scenario are never
production fallback data. Inherited real credentials are not passed to children.

The release rehearsal separately preserves imported history as history and
roundtrips the complete control/payment/model-cost/memory evidence into a fenced
restore target. It does not translate a real old journal/export, retire external
writers, connect an account or approve production activation. Native management
writes, real lifecycle/reconciliation, full semantic acceptance, production
capacity and staged release remain open.

import assert from "node:assert/strict";
import path from "node:path";

/**
 * Diagnostic location for a request URL: the pathname only. Query strings,
 * fragments, credentials and token-like path segments are never printed.
 */
export function redactedPath(raw, origin) {
  try {
    const url = new URL(raw);
    const where = url.origin === origin ? "" : url.protocol + "//" + url.host;
    return where + url.pathname.split("/").map(part => (/^[A-Za-z0-9_-]{24,}$/.test(part) || /^[0-9a-f]{16,}$/i.test(part)) ? ":redacted" : part).join("/");
  } catch {
    return "(unparseable url)";
  }
}

/** Real authenticated overview with the PostgreSQL rehearsal's recorded sales. */
export async function checkOnlyFansOverview(page, origin) {
  // The previous check leaves its page (the combined-earnings /revenue screen)
  // with requests still in flight. Attribute only the Overview's own traffic to
  // it: load a blank document first so late responses and aborts from the old
  // page cannot be reported against the Overview.
  await page.goto("about:blank");
  const writes = [], errors = [];
  // Console errors such as "Failed to load resource" carry no URL in their text.
  // These listeners record which response/request actually failed, so a failing
  // assertion names the resource instead of only the browser's generic message.
  const failed = [], requestFailures = [], pageErrors = [];
  const response = reply => {
    if (reply.status() >= 400) failed.push(`${reply.status()} ${reply.request().method()} ${redactedPath(reply.url(), origin)}`);
  };
  const requestFailed = request => requestFailures.push(`${request.method()} ${redactedPath(request.url(), origin)} (${request.failure()?.errorText ?? "failed"})`);
  const consoleError = message => {
    if (message.type() !== "error") return;
    const where = message.location()?.url ? ` [${redactedPath(message.location().url, origin)}]` : "";
    errors.push(message.text() + where);
  };
  const pageError = error => { errors.push(String(error)); pageErrors.push(String(error)); };
  const observe = request => {
    const url = new URL(request.url());
    // Next's development overlay resolves logged error frames through this
    // reserved diagnostic route. Every application/API write stays monitored.
    if (request.method() === "POST" && url.origin === origin &&
        url.pathname === "/__nextjs_original-stack-frames" && !url.search) return;
    if (request.url().startsWith(origin + "/") && !["GET", "HEAD"].includes(request.method())) {
      writes.push({ method: request.method(), url: request.url() });
    }
  };
  page.on("request", observe);
  page.on("response", response);
  page.on("requestfailed", requestFailed);
  page.on("console", consoleError);
  page.on("pageerror", pageError);
  try {
    await page.goto(origin + "/onlyfans/overview?account=acc-a", { waitUntil: "domcontentloaded", timeout: 90000 });
    const overview = page.locator('[data-of-surface="onlyfans-overview"]');
    await overview.waitFor({ timeout: 60000 });
    await overview.getByRole("heading", { name: "Overview", exact: true }).waitFor();
    // Recorded and pending earnings (28a45a8) joined the original cleared figures and account state.
    assert.deepEqual(await overview.locator("[data-of-overview-metric]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-of-overview-metric"))),
      ["Recorded net earnings", "Recorded gross earnings", "Pending net", "Pending gross", "Cleared net", "Cleared payments", "Refunded payments", "Connected accounts", "Need attention"]);
    assert.match(await overview.locator(".of-scope-line").innerText(), /Workspace totals · All authorised OnlyFans accounts/);
    assert.equal(await overview.locator('.of-creator-strip-items a[aria-current="true"]').getAttribute("href"), "/onlyfans/overview?period=7d&account=acc-a");
    const sales = overview.locator(".of-sale-row");
    assert.equal(await sales.count(), 4);
    const recorded = await sales.allTextContents();
    for (const amount of ["USD 10.00", "EUR 7.00", "USD 25.00", "USD 6.00"]) {
      assert(recorded.some(text => text.includes(amount)), `Overview lost original recorded amount ${amount}`);
    }
    assert.equal(await overview.locator('.of-payment-badge[data-status="pending"]').innerText(), "Pending");
    assert.equal(await overview.locator('.of-payment-badge[data-status="refunded"]').innerText(), "Refunded");
    await overview.getByRole("combobox", { name: "Reporting period", exact: true }).selectOption("30d");
    await Promise.all([
      page.waitForURL(url => url.pathname === "/onlyfans/overview" && url.searchParams.get("period") === "30d" && url.searchParams.get("account") === "acc-a"),
      overview.getByRole("button", { name: "Apply / refresh", exact: true }).click(),
    ]);
    await page.getByText("USD · UTC · Rolling 30 days", { exact: true }).waitFor();
    assert.equal(await page.locator(".of-sale-row").count(), 4, "Account activity is independent of the summary period");
    if (process.env.ONLYFANS_TEST_EVIDENCE) {
      // Hiding carets mutates even hidden inputs and can race React hydration.
      // Preserve the DOM while capturing this read-only server-rendered page.
      await page.screenshot({ path: path.join(process.env.ONLYFANS_TEST_EVIDENCE, "authenticated-onlyfans-overview.png"), fullPage: true, caret: "initial" });
    }
    await page.goto(origin + "/onlyfans/overview?account=acc-not-authorised", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.getByText("That account is not available to this session.", { exact: true }).waitFor({ timeout: 15000 });
    assert.equal(await page.locator(".of-sale-row").count(), 0, "An unlisted account must not expose sales activity");
    assert.deepEqual(writes, [], "Overview and its reporting-period refresh must remain read-only");
    const diagnostics = { failedResponses: failed, requestFailures, pageErrors };
    assert.deepEqual(failed, [], "Overview must not receive failing responses: " + JSON.stringify(diagnostics));
    // Navigating away aborts requests still in flight (net::ERR_ABORTED). That is
    // the browser cancelling, not a failure of the page, so it is reported but not asserted.
    assert.deepEqual(requestFailures.filter(line => !line.endsWith("(net::ERR_ABORTED)")), [], "Overview must not have failed requests: " + JSON.stringify(diagnostics));
    assert.deepEqual(errors, [], "Overview must not log hydration or application errors: " + JSON.stringify(diagnostics));
    console.log("OnlyFans Overview browser PASS: actual account/sales reads, original currencies and payment states, scoped period refresh, unavailable out-of-scope activity, no writes");
  } catch (error) {
    // Whatever failed first, name the failing resources the browser reported.
    console.error("Overview diagnostics:", JSON.stringify({ failedResponses: failed, requestFailures, pageErrors, consoleErrors: errors }));
    throw error;
  } finally {
    page.off("request", observe);
    page.off("response", response);
    page.off("requestfailed", requestFailed);
    page.off("console", consoleError);
    page.off("pageerror", pageError);
  }
}

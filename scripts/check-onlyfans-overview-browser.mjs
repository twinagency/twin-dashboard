import assert from "node:assert/strict";
import path from "node:path";

/** Real authenticated overview with the PostgreSQL rehearsal's recorded sales. */
export async function checkOnlyFansOverview(page, origin) {
  const writes = [];
  const observe = request => {
    if (request.url().startsWith(origin + "/") && !["GET", "HEAD"].includes(request.method())) {
      writes.push({ method: request.method(), url: request.url() });
    }
  };
  page.on("request", observe);
  try {
    await page.goto(origin + "/onlyfans/overview?account=acc-a", { waitUntil: "domcontentloaded", timeout: 90000 });
    const overview = page.locator('[data-of-surface="onlyfans-overview"]');
    await overview.waitFor({ timeout: 60000 });
    await overview.getByRole("heading", { name: "Overview", exact: true }).waitFor();
    assert.equal(await overview.locator("[data-of-overview-metric]").count(), 6);
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
      await page.screenshot({ path: path.join(process.env.ONLYFANS_TEST_EVIDENCE, "authenticated-onlyfans-overview.png"), fullPage: true });
    }
    await page.goto(origin + "/onlyfans/overview?account=acc-not-authorised", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.getByText("That account is not available to this session.", { exact: true }).waitFor({ timeout: 15000 });
    assert.equal(await page.locator(".of-sale-row").count(), 0, "An unlisted account must not expose sales activity");
    assert.deepEqual(writes, [], "Overview and its reporting-period refresh must remain read-only");
    console.log("OnlyFans Overview browser PASS: actual account/sales reads, original currencies and payment states, scoped period refresh, unavailable out-of-scope activity, no writes");
  } finally {
    page.off("request", observe);
  }
}

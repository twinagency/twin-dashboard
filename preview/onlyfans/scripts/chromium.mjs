// Shared Chromium resolution for the preview's browser scripts.
//
// The Playwright package pins one Chromium revision and this machine's cache
// holds another, so nothing is downloaded here: whichever browsers are already
// installed are tried in order and the first that starts is used. The full
// Chromium build needs a side-by-side runtime that is missing on this machine,
// so the headless shell is normally the one that wins. `PREVIEW_CHROME`
// overrides the whole search.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const CANDIDATE_PATHS = [
  ["chromium-", ["chrome-win64", "chrome.exe"], ["chrome-win", "chrome.exe"]],
  ["chromium_headless_shell-", ["chrome-headless-shell-win64", "chrome-headless-shell.exe"]],
];

function candidates() {
  if (process.env.PREVIEW_CHROME) return [process.env.PREVIEW_CHROME];
  const cache = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : null;
  if (!cache || !existsSync(cache)) return [undefined];
  const found = [];
  for (const name of readdirSync(cache).sort().reverse()) {
    for (const [prefix, ...paths] of CANDIDATE_PATHS) {
      if (!name.startsWith(prefix)) continue;
      for (const parts of paths) {
        const exe = join(cache, name, ...parts);
        if (existsSync(exe)) found.push(exe);
      }
    }
  }
  return [...found, undefined];
}

export async function launchPreviewBrowser() {
  const failures = [];
  for (const executablePath of candidates()) {
    try {
      return await chromium.launch(executablePath ? { executablePath } : {});
    } catch (error) {
      failures.push(`${executablePath ?? "bundled"}: ${String(error.message).split("\n")[0]}`);
    }
  }
  throw new Error(`No usable Chromium found.\n${failures.join("\n")}`);
}

export const PREVIEW_BASE = process.env.PREVIEW_URL || "http://localhost:3017/";

export async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(250);
}

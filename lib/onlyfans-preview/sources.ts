// The single entry point the dashboard uses to obtain a data source.
//
// Live means the dashboard's own read handlers, always. Fixture means the
// deterministic preview data, and the production build refuses it outright. The
// two never blend: there is no fallback in either direction, so no configuration
// and no failure can turn a live surface into sample data.

import { OnlyFansApiNotConfiguredError } from "./data-source";
import type { OnlyFansDataSource } from "./data-source";
import {
  createFixtureOnlyFansDataSource,
  type FixtureScenarios,
} from "./fixture-data-source";
import { createFetchOnlyFansTransport, createServerOnlyFansDataSource } from "./server-data-source";
import type { OnlyFansTransport } from "./server-data-source";
import type { PreviewViewer } from "./types";

export function createOnlyFansDataSource(options: {
  mode: "fixture" | "live";
  viewer: PreviewViewer;
  scenarios?: FixtureScenarios;
  latencyMs?: number;
  /**
   * The transport for live mode. Injected by tests so the handler/adapter flow
   * can be driven offline; omitted in the dashboard, which then uses the
   * dashboard's own same-origin read handlers.
   */
  transport?: OnlyFansTransport;
}): OnlyFansDataSource {
  if (options.mode === "live") {
    return createServerOnlyFansDataSource({
      transport: options.transport ?? createFetchOnlyFansTransport(),
    });
  }
  if (process.env.NODE_ENV === "production") {
    throw new OnlyFansApiNotConfiguredError(
      "Fixture OnlyFans data cannot be enabled in a production build. Configure the " +
        "scoped server API for the environment that needs live data.",
    );
  }
  return createFixtureOnlyFansDataSource({
    viewer: options.viewer,
    scenarios: options.scenarios,
    label: "Sample data",
    latencyMs: options.latencyMs,
  });
}

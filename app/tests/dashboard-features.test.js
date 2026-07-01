import { describe, expect, test } from "vitest";

import {
  getRefreshIntervalSeconds,
  shouldFetchQuotaOnTick,
} from "../src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";
import {
  SMART_HEALTH_INTERVAL_OPTIONS,
  getSmartHealthIntervalMs,
  summarizeProxyHealthResults,
} from "../src/app/(dashboard)/dashboard/proxy-pools/utils.js";
import { resolveConnectionProxyUrls, shouldRetryProxyResponse } from "../open-sse/utils/proxyFetch.js";

describe("quota refresh intervals", () => {
  test("accepts only supported minute intervals", () => {
    expect(getRefreshIntervalSeconds(1)).toBe(60);
    expect(getRefreshIntervalSeconds(5)).toBe(300);
    expect(getRefreshIntervalSeconds("10")).toBe(600);
    expect(getRefreshIntervalSeconds(2)).toBe(60);
  });

  test("keeps Claude quota refresh near three minutes", () => {
    expect(shouldFetchQuotaOnTick({ provider: "claude" }, 1, 60)).toBe(false);
    expect(shouldFetchQuotaOnTick({ provider: "claude" }, 3, 60)).toBe(true);
    expect(shouldFetchQuotaOnTick({ provider: "claude" }, 1, 300)).toBe(true);
    expect(shouldFetchQuotaOnTick({ provider: "openai" }, 1, 60)).toBe(true);
  });
});

describe("proxy retry", () => {
  test("retries next proxy on rate limits and provider errors", () => {
    expect(shouldRetryProxyResponse(new Response(null, { status: 429 }))).toBe(true);
    expect(shouldRetryProxyResponse(new Response(null, { status: 500 }))).toBe(true);
    expect(shouldRetryProxyResponse(new Response(null, { status: 502 }))).toBe(true);
    expect(shouldRetryProxyResponse(new Response(null, { status: 400 }))).toBe(false);
  });

  test("uses proxy list when provided and single proxy otherwise", () => {
    expect(resolveConnectionProxyUrls("https://example.com", {
      connectionProxyEnabled: true,
      connectionProxyUrl: "http://first:8080",
      connectionProxyUrls: ["http://second:8080"],
    })).toEqual(["http://second:8080"]);
    expect(resolveConnectionProxyUrls("https://example.com", {
      connectionProxyEnabled: true,
      connectionProxyUrl: "http://first:8080",
    })).toEqual(["http://first:8080"]);
  });
});

describe("proxy SmartHealth", () => {
  test("summarizes alive and dead proxy pool ids", () => {
    expect(summarizeProxyHealthResults([
      { id: "a", ok: true },
      { id: "b", ok: false },
      { id: "c", ok: false },
    ])).toEqual({ alive: 1, deadIds: ["b", "c"] });
  });

  test("supports scheduled health intervals", () => {
    expect(SMART_HEALTH_INTERVAL_OPTIONS.map((option) => option.value)).toEqual([15, 30, 60, 360, 720, 1440]);
    expect(getSmartHealthIntervalMs(15)).toBe(15 * 60 * 1000);
    expect(getSmartHealthIntervalMs("60")).toBe(60 * 60 * 1000);
    expect(getSmartHealthIntervalMs(999)).toBe(0);
  });
});

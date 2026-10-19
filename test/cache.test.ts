import assert from "node:assert/strict";
import { test } from "node:test";
import { MeteredProvider, type Provider } from "../src/providers/index.js";
import type { EnrichOptions, EnrichResult } from "../src/types.js";

const ok = { companyName: "A", organizationType: "exporter", sellsToBusinesses: "yes" as const, sellsProduct: "yes" as const, mainProducts: "", country: "", contactEmail: "", moq: "", certifications: "", confidence: "high" as const, citations: [], processor: "base" };

function memoryCache() {
  const m = new Map<string, unknown>();
  return { get: (k: string) => m.get(k), set: (k: string, v: unknown) => void m.set(k, v), size: () => m.size };
}

test("a failed enrichment is never cached, so a later run retries it", async () => {
  let attempts = 0;
  const provider: Provider = {
    name: "flaky", search: async () => [], extract: async () => [],
    enrich: async (urls: string[], _o: EnrichOptions): Promise<EnrichResult[]> => urls.map((url) => (++attempts === 1 ? { url, error: "killed" } : { url, enrichment: ok })),
  };
  const cache = memoryCache();
  const first = await new MeteredProvider(provider, 10, cache).enrich(["https://a.example"], { processor: "base", product: "x" });
  assert.equal(first[0]?.enrichment, undefined);
  assert.equal(cache.size(), 0, "error result must not be cached");
  const second = await new MeteredProvider(provider, 10, cache).enrich(["https://a.example"], { processor: "base", product: "x" });
  assert.ok(second[0]?.enrichment, "retried and succeeded");
  assert.equal(cache.size(), 1, "success is cached");
  const m = new MeteredProvider(provider, 10, cache);
  await m.enrich(["https://a.example"], { processor: "base", product: "x" });
  assert.equal(m.cacheHits, 1);
  assert.equal(attempts, 2, "third call served from cache");
});

test("search and extract results are still cached as before", async () => {
  let calls = 0;
  const provider: Provider = { name: "p", search: async () => { calls++; return []; }, extract: async () => [] };
  const cache = memoryCache();
  const m = new MeteredProvider(provider, 10, cache);
  await m.search(["q"]);
  await m.search(["q"]);
  assert.equal(calls, 1);
});

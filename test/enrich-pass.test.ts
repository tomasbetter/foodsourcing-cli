import assert from "node:assert/strict";
import { test } from "node:test";
import { enrichCandidates, enrichPass } from "../src/enrich-pass.js";
import { MeteredProvider, type Provider } from "../src/providers/index.js";
import { evaluate } from "../src/verify.js";
import { newPool, newSupplier, upsert } from "../src/resolve.js";
import type { EnrichOptions, EnrichResult, Enrichment } from "../src/types.js";

const verdict = (over: Partial<Enrichment>): Enrichment => ({
  companyName: "Acme", organizationType: "exporter", sellsToBusinesses: "yes", sellsProduct: "yes", mainProducts: "bananas",
  country: "Peru", contactEmail: "sales@acme.pe", moq: "", certifications: "", confidence: "high", citations: [], processor: "base", ...over,
});

class FakeProvider implements Provider {
  readonly name = "fake";
  seen: string[][] = [];
  async search() { return []; }
  async extract() { return []; }
  async enrich(urls: string[], _o: EnrichOptions): Promise<EnrichResult[]> {
    this.seen.push(urls);
    return urls.map((url) => {
      if (url.includes("bad")) return { url, error: "boom" };
      const market = url.includes("market");
      return { url, enrichment: verdict(market ? { organizationType: "marketplace_or_directory", sellsToBusinesses: "no" } : {}) };
    });
  }
}

test("enrichPass judges candidates, records failures, honours the cap and never repeats a site", async () => {
  const pool = newPool();
  for (const host of ["acme.pe", "market.com", "bad.example", "other.pe", "third.pe"]) upsert(pool, newSupplier(host, `https://${host}`));
  const fake = new FakeProvider();
  const provider = new MeteredProvider(fake, 20);
  const cfg = { processor: "base", product: "bananas", max: 4, done: 0, failed: 0 };
  const judged = await enrichPass(provider, pool, cfg, () => undefined);
  assert.equal(judged, 3);
  assert.equal(cfg.done, 4);
  assert.equal(cfg.failed, 1);
  const market = pool.byKey.get("market.com");
  assert.equal(market && evaluate(market).status, "rejected");
  assert.ok(pool.byKey.get("bad.example")?.notes.some((n) => n.includes("enrichment failed")));
  assert.equal(await enrichPass(provider, pool, cfg, () => undefined), 0, "cap reached, nothing more is judged");
  assert.equal(fake.seen.length, 4, "one Task run per site, so a slow site never blocks the others");
  assert.ok(fake.seen.every((urls) => urls.length === 1));
  assert.ok(enrichCandidates(pool).every((s) => !s.enrichment));
});

test("a provider without enrichment support is skipped cleanly", async () => {
  const plain: Provider = { name: "plain", search: async () => [], extract: async () => [] };
  const provider = new MeteredProvider(plain, 5);
  assert.equal(provider.canEnrich, false);
  const pool = newPool();
  upsert(pool, newSupplier("a", "https://a.example"));
  assert.equal(await enrichPass(provider, pool, { processor: "base", product: "x", max: 5, done: 0, failed: 0 }, () => undefined), 0);
});

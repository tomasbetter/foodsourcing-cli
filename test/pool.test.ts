import assert from "node:assert/strict";
import { test } from "node:test";
import { clampConcurrency, mapLimit } from "../src/pool.js";
import { enrichPass } from "../src/enrich-pass.js";
import { MeteredProvider, type Provider } from "../src/providers/index.js";
import { newPool, newSupplier, upsert } from "../src/resolve.js";
import type { EnrichOptions, EnrichResult } from "../src/types.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("mapLimit never exceeds the limit, uses all of it, and keeps input order", async () => {
  let active = 0;
  let peak = 0;
  const out = await mapLimit([...Array(12).keys()], 4, async (n) => {
    active++;
    peak = Math.max(peak, active);
    await sleep(5 + (n % 3) * 4);
    active--;
    return n * 2;
  });
  assert.equal(peak, 4);
  assert.deepEqual(out, [...Array(12).keys()].map((n) => n * 2));
});

test("mapLimit handles empty input and tiny limits", async () => {
  assert.deepEqual(await mapLimit([], 5, async (x) => x), []);
  assert.deepEqual(await mapLimit([1, 2, 3], 0, async (x) => x + 1), [2, 3, 4]);
});

test("clampConcurrency keeps values between 1 and 50", () => {
  assert.equal(clampConcurrency(undefined), 10);
  assert.equal(clampConcurrency(Number.NaN, 7), 7);
  assert.equal(clampConcurrency(0), 1);
  assert.equal(clampConcurrency(500), 50);
  assert.equal(clampConcurrency(30), 30);
});

class SlowProvider implements Provider {
  readonly name = "slow";
  active = 0;
  peak = 0;
  async search() { return []; }
  async extract() { return []; }
  async enrich(urls: string[], _o: EnrichOptions): Promise<EnrichResult[]> {
    this.active++;
    this.peak = Math.max(this.peak, this.active);
    await sleep(urls[0]?.includes("slow") ? 80 : 5);
    this.active--;
    return urls.map((url) => ({
      url,
      enrichment: { companyName: "A", organizationType: "exporter", sellsToBusinesses: "yes" as const, sellsProduct: "yes" as const, mainProducts: "", country: "", contactEmail: "", moq: "", certifications: "", confidence: "high" as const, citations: [], processor: "base" },
    }));
  }
}

test("enrichPass runs Task runs in parallel and one slow site does not hold back the rest", async () => {
  const pool = newPool();
  for (let i = 0; i < 10; i++) upsert(pool, newSupplier(`s${i}`, `https://${i === 0 ? "slow" : "fast"}${i}.example`));
  const fake = new SlowProvider();
  const provider = new MeteredProvider(fake, 50);
  const cfg = { processor: "base", product: "x", max: 10, done: 0, failed: 0, concurrency: 5 };
  const started = Date.now();
  const judged = await enrichPass(provider, pool, cfg, () => undefined);
  assert.equal(judged, 10);
  assert.equal(fake.peak, 5);
  assert.ok(Date.now() - started < 300, "ran in parallel, not one after another");
});

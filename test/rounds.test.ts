import assert from "node:assert/strict";
import { test } from "node:test";
import { discover } from "../src/discover.js";
import { MeteredProvider, type Provider } from "../src/providers/index.js";
import { planQueries } from "../src/planner.js";

function emptyProvider(counter: { searches: number }): Provider {
  return {
    name: "empty",
    search: async () => {
      counter.searches++;
      return [];
    },
    extract: async () => [],
  };
}

test("round size does not depend on concurrency, so --target can stop early", async () => {
  const total = planQueries("bananas").queries.length;
  for (const concurrency of [5, 20, 50]) {
    const counter = { searches: 0 };
    const file = await discover(new MeteredProvider(emptyProvider(counter), 500), "bananas", {
      budget: 500, target: 10, concurrency, roundQueries: 18, enrich: false,
    });
    assert.equal(file.run.rounds?.length, Math.ceil(total / 18), `concurrency ${concurrency}`);
    assert.ok((file.run.rounds?.length ?? 0) > 1, "more than one round, so a target can stop the loop early");
    assert.equal(counter.searches, Math.ceil(total / 3), "every query is still searched once");
  }
});

test("without a target everything is searched in one round", async () => {
  const counter = { searches: 0 };
  const file = await discover(new MeteredProvider(emptyProvider(counter), 500), "bananas", { budget: 500, concurrency: 20, enrich: false });
  assert.equal(file.run.rounds?.length, 1);
});

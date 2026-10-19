import assert from "node:assert/strict";
import { test } from "node:test";
import { ComposioProvider, type CliRunner } from "../src/providers/composio.js";

const content = {
  company_name: "Acme Bars", organization_type: "processor_or_packer", sells_food_to_businesses: "yes", sells_requested_product: "yes",
  main_products: "protein bars", country: "Poland", contact_email: "sales@example.test", minimum_order_quantity: "", certifications: "",
};

/** A fake composio CLI. `statuses` is the sequence of run states returned by status polls. */
function fakeCli(statuses: string[], log: string[]): CliRunner {
  let polls = 0;
  return async (args) => {
    if (args[0] === "execute") {
      log.push(`execute ${args[1]}`);
      return JSON.stringify({ successful: true, data: { run_id: "trun_1" } });
    }
    const url = args[1] as string;
    if (url.endsWith("/result")) {
      log.push("result");
      return JSON.stringify({ data: { output: { content, basis: [{ field: "organization_type", confidence: "high", citations: [{ url: "https://x.example" }] }] } } });
    }
    log.push("status");
    const s = statuses[Math.min(polls++, statuses.length - 1)];
    return JSON.stringify({ data: { status: s, errors: s === "failed" ? [{ message: "bad input" }] : null } });
  };
}

test("enrich polls the status and reads the result only after the run completed", async () => {
  const log: string[] = [];
  const provider = new ComposioProvider("composio", fakeCli(["queued", "running", "completed"], log), 1, 5000);
  const [r] = await provider.enrich(["https://acme.example"], { processor: "base", product: "protein bars" });
  assert.equal(r?.enrichment?.organizationType, "processor_or_packer");
  assert.deepEqual(log, ["execute PARALLEL_CREATE_TASK_RUN", "status", "status", "status", "result"]);
});

test("a failed run is reported as an error for that site only", async () => {
  const log: string[] = [];
  const provider = new ComposioProvider("composio", fakeCli(["running", "failed"], log), 1, 5000);
  const [r] = await provider.enrich(["https://acme.example"], { processor: "base", product: "x" });
  assert.equal(r?.enrichment, undefined);
  assert.match(r?.error ?? "", /task failed: bad input/);
  assert.ok(!log.includes("result"), "never fetches a result for a failed run");
});

test("a run that never completes times out without hanging", async () => {
  const provider = new ComposioProvider("composio", fakeCli(["running"], []), 5, 40);
  const [r] = await provider.enrich(["https://acme.example"], { processor: "base", product: "x" });
  assert.match(r?.error ?? "", /timed out/);
});

test("a CLI error for one site does not fail the others", async () => {
  const cli: CliRunner = async (args) => {
    if (args[0] === "execute" && args[3]?.includes("bad.example")) throw new Error("composio crashed");
    return fakeCli(["completed"], [])(args, 1);
  };
  const provider = new ComposioProvider("composio", cli, 1, 5000);
  const out = await provider.enrich(["https://bad.example", "https://good.example"], { processor: "base", product: "x" });
  assert.match(out[0]?.error ?? "", /crashed/);
  assert.ok(out[1]?.enrichment);
});

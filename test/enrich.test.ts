import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEnrichment } from "../src/apply-enrichment.js";
import { buildTaskSpec, parseTaskResult } from "../src/enrich.js";
import { evaluate } from "../src/verify.js";
import { newSupplier } from "../src/resolve.js";
import type { Enrichment } from "../src/types.js";

const taskResult = (content: Record<string, string>, confidence = "high") => ({
  data: {
    output: {
      content,
      basis: [
        { field: "organization_type", confidence, citations: [{ url: "https://x.example/about" }] },
        { field: "sells_food_to_businesses", confidence: "high", citations: [{ url: "https://x.example/contact" }] },
      ],
    },
  },
});

const realContent = {
  company_name: "BanaBay Limited", organization_type: "farm_or_grower", sells_food_to_businesses: "yes",
  sells_requested_product: "yes", main_products: "bananas", country: "Ecuador", contact_email: "sales@example-grower.test",
  minimum_order_quantity: "1 container", certifications: "GlobalG.A.P., Fairtrade",
};

export const enrichment = (over: Partial<Enrichment> = {}): Enrichment => ({
  companyName: "Acme Bananas", organizationType: "exporter", sellsToBusinesses: "yes", sellsProduct: "yes", mainProducts: "bananas",
  country: "Peru", contactEmail: "sales@acme.pe", moq: "", certifications: "", confidence: "high", citations: [], processor: "base", ...over,
});

test("task spec is a strict JSON schema with every field required", () => {
  const spec = buildTaskSpec("bananas") as { output_schema: { type: string; json_schema: { required: string[]; properties: object; additionalProperties: boolean } } };
  const s = spec.output_schema.json_schema;
  assert.equal(spec.output_schema.type, "json");
  assert.equal(s.additionalProperties, false);
  assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
});

test("parseTaskResult reads both the direct and the Composio shapes and takes the weakest key confidence", () => {
  const direct = parseTaskResult({ output: taskResult(realContent, "medium").data.output }, "base");
  const composio = parseTaskResult(taskResult(realContent, "high"), "base");
  assert.equal(direct?.confidence, "medium");
  assert.equal(composio?.organizationType, "farm_or_grower");
  assert.deepEqual(composio?.citations, ["https://x.example/about", "https://x.example/contact"]);
  assert.equal(parseTaskResult({ output: { content: {} } }, "base"), undefined);
  assert.equal(parseTaskResult(null, "base"), undefined);
});

test("a real supplier verdict sets type, country, email, MOQ and certifications", () => {
  const s = newSupplier("Banabay", "https://banabay.com");
  applyEnrichment(s, enrichment({ organizationType: "wholesaler_or_distributor", certifications: "GlobalG.A.P., Fairtrade", moq: "1 container" }));
  assert.equal(s.assessment?.kind, "supplier");
  assert.equal(s.labels[0]?.type, "wholesaler");
  assert.equal(s.country, "PE");
  assert.deepEqual(s.emails, ["sales@acme.pe"]);
  assert.deepEqual(s.certifications, ["GlobalG.A.P.", "Fairtrade"]);
  assert.equal(s.moq, "1 container");
});

test("marketplaces, agencies, news and software are rejected; unclear sellers stay unknown", () => {
  for (const type of ["marketplace_or_directory", "trade_data_platform", "government_agency_or_association", "news_or_media", "software_or_service"]) {
    const s = newSupplier("X", "https://x.example");
    applyEnrichment(s, enrichment({ organizationType: type, sellsToBusinesses: "no" }));
    assert.equal(evaluate(s).status, "rejected", type);
  }
  const s = newSupplier("X", "https://x.example");
  applyEnrichment(s, enrichment({ sellsToBusinesses: "unclear" }));
  assert.equal(s.assessment?.kind, "unknown");
  const t = newSupplier("Y", "https://y.example");
  applyEnrichment(t, enrichment({ sellsProduct: "no" }));
  assert.equal(t.assessment?.kind, "unknown");
});

test("a low-confidence task result does not overturn an earlier page assessment", () => {
  const s = newSupplier("Z", "https://z.example");
  s.assessment = { kind: "platform", commercialSignals: 0, reasons: ["looks like platform"] };
  applyEnrichment(s, enrichment({ confidence: "low" }));
  assert.equal(s.assessment?.kind, "platform");
  assert.ok(s.notes.some((n) => n.includes("low confidence")));
});

test("a registry name is kept when the task proposes another company name", () => {
  const s = newSupplier("FANALBA S.A.", "https://fanalba.com");
  s.evidence.push({ kind: "B", url: "https://agrocalidad.gob.ec/l.pdf", retrievedAt: "", excerpt: "", name: "FANALBA S.A." });
  applyEnrichment(s, enrichment({ companyName: "Fanalba Fruit Co" }));
  assert.equal(s.name, "FANALBA S.A.");
});

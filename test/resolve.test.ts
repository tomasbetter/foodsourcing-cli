import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyHit } from "../src/classify.js";
import { isDistinctiveName } from "../src/harvest.js";
import { hitMatchesLead } from "../src/resolve-leads.js";
import { companyNamesIn } from "../src/resolve.js";

test("europages on any TLD is a directory, not a supplier", () => {
  assert.equal(classifyHit({ url: "https://europages.co.uk/en/bananas", title: "Bananas", excerpts: ["wholesale bananas suppliers"] }), "directory");
  assert.equal(classifyHit({ url: "https://agritrop.cirad.fr/x", title: "Banana", excerpts: ["export"] }), "news_reference");
});

test("generic product names never confirm a supplier", () => {
  assert.ok(!isDistinctiveName("Bananas"));
  assert.ok(!isDistinctiveName("Banana"));
  assert.ok(isDistinctiveName("EXPORBANANAS S.A."));
  assert.ok(isDistinctiveName("Hacienda Celia"));
});

test("registry names are pulled from a listing", () => {
  const text = "1 EXPORTADORA PALACIOS&PALACIOS EXPOFRUTPAL S A BANANO 2 FANALBA S.A. BANANO FIRESKY S.A. BANANO";
  const names = companyNamesIn(text);
  assert.ok(names.some((n) => n.includes("FANALBA")));
  assert.ok(names.some((n) => n.includes("FIRESKY")));
});

test("a site hit only belongs to a lead when the company name matches", () => {
  const lead = { name: "FANALBA S.A." };
  const good = { url: "https://www.fanalba.com/", title: "Fanalba - Bananas from Ecuador", excerpts: ["Fanalba exports bananas. Contact us for wholesale orders."] };
  const bad = { url: "https://www.otherfruit.com/", title: "Other Fruit Export", excerpts: ["Wholesale bananas, contact us"] };
  assert.ok(hitMatchesLead(good, lead));
  assert.ok(!hitMatchesLead(bad, lead));
});

test("directories, marketplaces and social pages are never treated as a company's own site", async () => {
  const { isThirdPartyHost, applyOwnSite, newPool } = await import("../src/resolve.js");
  assert.ok(isThirdPartyHost("https://www.pinterest.com/coragrofrut/"));
  assert.ok(isThirdPartyHost("https://www.tradewheel.com/co/sebanqui-sa-11911/"));
  assert.ok(!isThirdPartyHost("https://mendoexport.com/"));
  const pool = newPool();
  const r = applyOwnSite(pool, { url: "https://www.tradewheel.com/x", title: "Sebanqui", excerpts: ["info@example-market.test wholesale"] }, true);
  assert.equal(r, undefined);
  assert.equal(pool.byKey.size, 0);
});

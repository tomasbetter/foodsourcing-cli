import assert from "node:assert/strict";
import { test } from "node:test";
import { assessPage } from "../src/quality.js";
import { isQualified, mergeAssessment, plainText } from "../src/ingest.js";
import { evaluate } from "../src/verify.js";
import { newSupplier } from "../src/resolve.js";

const terms = ["honey", "miel"];
const a = (title: string, text: string, host = "example-honey.com") => assessPage({ url: `https://${host}`, host, title, text, productTerms: terms });

test("marketplaces, trade-data, agencies, news, software and finance pages are not suppliers", () => {
  assert.equal(a("B2B Marketplace", "Your one-stop marketplace. Find verified suppliers and buyers. honey wholesale").kind, "platform");
  assert.equal(a("Trade data", "Verified customs data from 50 countries. Import export data. honey").kind, "platform");
  assert.equal(a("CBI", "We help small and medium-sized enterprises export products to Europe. honey").kind, "agency");
  assert.equal(a("Times", "Latest articles. News briefs. Newsletter. honey").kind, "news");
  assert.equal(a("CRM", "Book a demo of our AI-powered ERP and CRM software. honey").kind, "software");
  assert.equal(a("Trade", "International trade finance and project funding. Commodity trading. honey").kind, "finance");
});

test("a company page with trade terms, a quote link and its own contact is a supplier", () => {
  const r = a("Example Honey", "We are an exporter of honey. Bulk honey, private label. Request a quote: sales@example-honey.com");
  assert.equal(r.kind, "supplier");
});

test("a page that never mentions the product is not a supplier", () => {
  assert.notEqual(a("Acme", "We are an exporter. Bulk goods, request a quote. info@acme-goods.com", "acme-goods.com").kind, "supplier");
});

test("qualified needs supplier content and a contact; negatives win when merging", () => {
  const s = newSupplier("Example Honey", "https://example-honey.com");
  s.assessment = { kind: "supplier", commercialSignals: 3, reasons: [] };
  assert.equal(isQualified(s), false);
  s.emails.push("sales@example-honey.com");
  assert.equal(isQualified(s), true);
  const merged = mergeAssessment(s.assessment, { kind: "platform", commercialSignals: 0, reasons: [] });
  assert.equal(merged.kind, "platform");
  s.assessment = merged;
  assert.equal(evaluate(s).status, "rejected");
});

test("markdown links keep their visible text", () => {
  assert.match(plainText("[Request a Quote](https://x.y/q) ![logo](a.png)"), /^Request a Quote$/);
});

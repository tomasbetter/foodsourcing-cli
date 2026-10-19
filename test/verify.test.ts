import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate, independentProofs, namesAgree, normalizeName } from "../src/verify.js";
import { makeEvidence, newSupplier } from "../src/resolve.js";

const withEvidence = (name: string, evidence: ReturnType<typeof makeEvidence>[]) => {
  const s = newSupplier(name, "https://example-farm.ec");
  s.evidence = evidence;
  return s;
};

test("normalizeName strips legal suffixes and accents", () => {
  assert.equal(normalizeName("Hacienda Celia M. S.A."), "hacienda celia m");
  assert.ok(namesAgree("Fanalba S.A.", "FANALBA SA"));
  assert.ok(!namesAgree("Fanalba S.A.", "Expovillang S.A."));
});

test("directory evidence never counts as proof", () => {
  const s = withEvidence("Acme Bananas", [
    makeEvidence("E", "https://tridge.com/a", "listing"),
    makeEvidence("E", "https://volza.com/b", "listing"),
  ]);
  assert.equal(evaluate(s).status, "lead");
});

test("one proof is corroborated, two independent proofs verify", () => {
  const a = makeEvidence("A", "https://acme.ec/contact", "contact", { name: "Acme", country: "EC" });
  const b = makeEvidence("B", "https://agrocalidad.gob.ec/list.pdf", "list", { name: "Acme", country: "EC" });
  assert.equal(evaluate(withEvidence("Acme", [a])).status, "corroborated");
  assert.equal(evaluate(withEvidence("Acme", [a, b])).status, "verified");
});

test("two proofs of the same kind or same host are not independent", () => {
  const a1 = makeEvidence("A", "https://acme.ec/contact", "x", { country: "EC" });
  const a2 = makeEvidence("A", "https://acme.ec/about", "y", { country: "EC" });
  const b = makeEvidence("B", "https://acme.ec/registry", "z", { country: "EC" });
  assert.equal(independentProofs([a1, a2, b]).length, 1);
  assert.equal(evaluate(withEvidence("Acme", [a1, a2, b])).status, "corroborated");
});

test("country conflict between proofs sends the supplier to needs_review", () => {
  const a = makeEvidence("A", "https://acme.example/c", "x", { name: "Acme", country: "EC" });
  const b = makeEvidence("B", "https://registry.example/list", "y", { name: "Acme", country: "ES" });
  const v = evaluate(withEvidence("Acme", [a, b]));
  assert.equal(v.status, "needs_review");
  assert.match(v.reasons.join(" "), /country/);
});

test("old verification becomes stale", () => {
  const a = makeEvidence("A", "https://acme.ec/c", "x", { name: "Acme", country: "EC" });
  const b = makeEvidence("B", "https://reg.gob.ec/l", "y", { name: "Acme", country: "EC" });
  const s = withEvidence("Acme", [a, b]);
  s.lastVerified = "2020-01-01T00:00:00.000Z";
  assert.equal(evaluate(s, { now: new Date("2026-10-19") }).status, "stale");
});

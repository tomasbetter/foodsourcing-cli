import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyHit } from "../src/classify.js";
import { countryFromHost, countryFromPhone } from "../src/countries.js";
import { findCertifications, findEmails, findMoq, guessCountry, labelTypes } from "../src/extract.js";
import { planQueries, VagueInputError } from "../src/planner.js";

test("planner rejects vague input", () => {
  assert.throws(() => planQueries("best fruit suppliers"), VagueInputError);
  assert.throws(() => planQueries("food"), VagueInputError);
});

test("planner builds multilingual B2B queries for bananas", () => {
  const plan = planQueries("bananas");
  assert.ok(plan.queries.length >= 10);
  assert.ok(plan.countries.includes("EC"));
  assert.ok(plan.languages.includes("es"));
  assert.ok(plan.queries.some((q) => q.includes("banano")));
  assert.ok(plan.queries.every((q) => /export|wholesale|supplier|producer|productor|importer|manufacturer|registry|fairtrade|mayor|didmen|hurt|quote|grower|farm/i.test(q)));
});

test("planner honours country and language filters", () => {
  const plan = planQueries("honey", { countries: ["Lithuania", "PL"], languages: ["lt"] });
  assert.deepEqual(plan.countries, ["LT", "PL"]);
  assert.ok(plan.queries.some((q) => q.includes("medus")));
  assert.ok(!plan.queries.some((q) => q.includes("miód")));
});

test("classifier separates registries, directories, trade data and noise", () => {
  const c = (url: string, title: string, text = "") => classifyHit({ url, title, excerpts: [text] });
  assert.equal(c("https://www.agrocalidad.gob.ec/wp-content/uploads/listado_exportadores.pdf", "Listado exportadores"), "registry");
  assert.equal(c("https://www.tridge.com/market-overview/fresh-cavendish-banana", "Suppliers"), "directory");
  assert.equal(c("https://www.seair.co.in/banana-ecuador-exporters", "Banana Exporters"), "trade_data");
  assert.equal(c("https://en.wiktionary.org/wiki/gamintojas", "gamintojas"), "news_reference");
  assert.equal(c("https://www.merriam-webster.com/dictionary/organic", "ORGANIC Definition & Meaning", "definition"), "news_reference");
  assert.equal(c("https://www.baltumedus.lt/", "Baltu Medus", "Orders start from 700 kg. wholesale honey from our apiaries"), "supplier_site");
  assert.equal(c("https://example.com/", "Hello", ""), "noise");
});

test("extraction pulls emails, MOQ, certifications and labels", () => {
  const text = "Orders start from 700 kg. up to 20 000 kg. Contact info@example-honey.lt or Info@example-honey.test. Organic, Fairtrade and GlobalGAP certified wholesale honey exporter.";
  assert.deepEqual(findEmails(text), ["info@example-honey.lt", "info@example-honey.test"]);
  assert.match(findMoq(text) ?? "", /700 kg/);
  assert.deepEqual(findCertifications(text), ["Organic", "Fairtrade", "GlobalG.A.P."]);
  const types = labelTypes(text).map((l) => l.type);
  assert.ok(types.includes("wholesaler") && types.includes("exporter"));
});

test("country signals: a +34 phone on an Ecuador page is flagged as a conflict", () => {
  assert.equal(countryFromPhone("+34 629 85 99 19"), "ES");
  assert.equal(countryFromPhone("629 85 99 19"), undefined);
  assert.equal(countryFromHost("agrocalidad.gob.ec"), "EC");
  assert.equal(countryFromHost("example.com"), undefined);
  const g = guessCountry("https://pologroupcompany.com/wholesale-bananas/", "Wholesale bananas from Ecuador. Ecuador bananas shipped worldwide.", ["+34 629 85 99 19"]);
  assert.ok(g.signals.includes("phone:ES") && g.signals.includes("text:EC"));
});

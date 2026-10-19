#!/usr/bin/env node
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Command } from "commander";
import { discover } from "./discover.js";
import { loadDotEnv } from "./env.js";
import { readDiscovery, saveDiscovery, supplierRow, toCsv, writeDiscovery } from "./output.js";
import { DiskCache, MeteredProvider, createProvider, resolveProviderName } from "./providers/index.js";
import { renderReport } from "./report.js";
import { applyVerdict } from "./verify.js";
import type { DiscoveryFile } from "./types.js";

loadDotEnv();

const program = new Command();
program.name("foodsourcing").description("Discover, classify and verify food suppliers worldwide.").version("0.1.0");

const list = (v: string): string[] => v.split(",").map((x) => x.trim()).filter(Boolean);

function fail(message: string): void {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}

program
  .command("init")
  .description("Create a .env file from the template if none exists")
  .action(() => {
    const target = resolve(".env");
    if (existsSync(target)) return console.log(".env already exists; left unchanged.");
    writeFileSync(target, "FOODSOURCING_PROVIDER=\nPARALLEL_API_KEY=\n");
    console.log("Created .env. Add your PARALLEL_API_KEY (https://platform.parallel.ai), then run: foodsourcing doctor");
  });

program
  .command("doctor")
  .description("Check provider configuration and connectivity")
  .action(async () => {
    const name = resolveProviderName();
    console.log(`Provider: ${name}`);
    if (name === "parallel" && !process.env.PARALLEL_API_KEY) return fail("PARALLEL_API_KEY is not set");
    try {
      const hits = await createProvider().search(["coffee producers Colombia"]);
      console.log(`OK: search returned ${hits.length} results.`);
    } catch (err) {
      fail(`Provider check failed: ${(err as Error).message}`);
    }
  });

program
  .command("discover <product>")
  .description("Find suppliers for a product (searches, classifies, extracts and verifies)")
  .option("--out <dir>", "output directory", "./out")
  .option("--countries <list>", "comma-separated country names or ISO codes")
  .option("--languages <list>", "comma-separated language codes, e.g. en,es")
  .option("--budget <n>", "maximum provider calls", "200")
  .option("--target <n>", "keep searching in rounds until this many suppliers pass the quality gate")
  .option("--max-rounds <n>", "maximum search rounds when --target is set")
  .option("--concurrency <n>", "parallel search/extract calls, 1-50 (20 measured best)", "20")
  .option("--round-queries <n>", "queries searched per round when --target is set", "18")
  .option("--enrich-concurrency <n>", "parallel Task API runs, 1-50", "20")
  .option("--no-enrich", "skip Parallel Task API judging of candidate sites (use page-content checks only)")
  .option("--enrich-processor <name>", "Task API processor: lite, base or core", "base")
  .option("--max-enrich <n>", "maximum sites judged per run (each is one billed Task run)", "40")
  .option("--no-cache", "disable the on-disk response cache")
  .action(async (product: string, o: { concurrency: string; roundQueries: string; enrichConcurrency: string; enrich: boolean; enrichProcessor: string; maxEnrich: string; out: string; countries?: string; languages?: string; budget: string; target?: string; maxRounds?: string; cache: boolean }) => {
    try {
      const budget = Number.parseInt(o.budget, 10);
      if (!Number.isInteger(budget) || budget < 1) return fail("--budget must be a positive integer");
      const cache = o.cache ? new DiskCache(join(resolve(o.out), ".cache")) : undefined;
      const provider = new MeteredProvider(createProvider(), budget, cache);
      const file = await discover(provider, product, {
        budget,
        enrich: o.enrich,
        concurrency: Number.parseInt(o.concurrency, 10),
        roundQueries: Number.parseInt(o.roundQueries, 10),
        enrichConcurrency: Number.parseInt(o.enrichConcurrency, 10),
        enrichProcessor: o.enrichProcessor,
        maxEnrich: Number.parseInt(o.maxEnrich, 10),
        target: o.target ? Number.parseInt(o.target, 10) : undefined,
        maxRounds: o.maxRounds ? Number.parseInt(o.maxRounds, 10) : undefined,
        countries: o.countries ? list(o.countries) : undefined,
        languages: o.languages ? list(o.languages) : undefined,
        log: (m) => console.log(m),
      });
      const paths = writeDiscovery(resolve(o.out), file);
      const verified = file.suppliers.filter((s) => s.status === "verified").length;
      const rejected = file.suppliers.filter((s) => s.status === "rejected").length;
      if (file.run.enriched) {
        const price = ({ lite: 0.005, base: 0.01, core: 0.025 } as Record<string, number>)[o.enrichProcessor];
        const cost = price === undefined ? "cost unknown for this processor" : `about $${(file.run.enriched * price).toFixed(2)} at list price`;
        console.log(`\nJudged ${file.run.enriched} sites with the Task API (${o.enrichProcessor}); ${cost}.`);
      }
      console.log(`\n${file.suppliers.length} records: ${file.run.qualified ?? 0} qualified, ${verified} verified, ${rejected} rejected as non-suppliers. Calls used: ${file.run.callsUsed}/${budget}.`);
      if (o.target && (file.run.qualified ?? 0) < Number.parseInt(o.target, 10)) console.log(`Target of ${o.target} qualified suppliers not reached; raise --budget or --max-rounds.`);
      console.log(`Wrote ${paths.json}\n      ${paths.csv}\n      ${paths.evidence}`);
    } catch (err) {
      fail((err as Error).message);
    }
  });

program
  .command("verify <file>")
  .description("Re-apply the two-proof verification rule to a discovery JSON file")
  .action((file: string) => {
    const data = readDiscovery(resolve(file));
    data.suppliers = data.suppliers.map((s) => applyVerdict(s));
    saveDiscovery(resolve(file), data);
    const counts: Record<string, number> = {};
    for (const s of data.suppliers) counts[s.status] = (counts[s.status] ?? 0) + 1;
    console.log(`Updated ${data.suppliers.length} suppliers: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  });

program
  .command("review <file>")
  .description("List suppliers that need human review (conflicts, stale, traders)")
  .action((file: string) => {
    const data = readDiscovery(resolve(file));
    const rows = data.suppliers.filter((s) => s.status === "needs_review" || s.status === "stale" || s.labels.some((l) => l.type === "trader"));
    if (rows.length === 0) return console.log("Nothing needs review.");
    for (const s of rows) console.log(`- ${s.name} [${s.status}] ${s.notes.filter((n) => n.startsWith("verify: ")).join(" | ")}`);
  });

program
  .command("export <file>")
  .description("Export a discovery file as csv or json")
  .option("--format <fmt>", "csv or json", "csv")
  .option("--status <list>", "only these statuses, e.g. verified,corroborated")
  .action((file: string, o: { format: string; status?: string }) => {
    const data = readDiscovery(resolve(file));
    const wanted = o.status ? new Set(list(o.status)) : undefined;
    const rows = data.suppliers.filter((s) => !wanted || wanted.has(s.status));
    if (o.format === "json") console.log(JSON.stringify(rows.map(supplierRow), null, 2));
    else if (o.format === "csv") process.stdout.write(toCsv(rows));
    else fail("--format must be csv or json");
  });

program
  .command("report <path>")
  .description("Summarise one discovery file or every *.json file in a directory")
  .action((path: string) => {
    const target = resolve(path);
    const files = existsSync(target) && !target.endsWith(".json")
      ? readdirSync(target).filter((f) => f.endsWith(".json") && !f.endsWith(".evidence.json")).map((f) => join(target, f))
      : [target];
    const data: DiscoveryFile[] = files.map(readDiscovery).filter((d) => Array.isArray(d.suppliers) && d.run);
    if (data.length === 0) return fail("No discovery files found");
    console.log(renderReport(data));
  });

await program.parseAsync(process.argv);

import { classifyHit, hostOf } from "./classify.js";
import { countryName } from "./countries.js";
import { squash } from "./harvest.js";
import { applyOwnSite, type Pool } from "./resolve.js";
import { BudgetExceededError, type MeteredProvider } from "./providers/index.js";
import { namesAgree } from "./verify.js";
import type { ExtractResult, SearchHit, Supplier } from "./types.js";

const EXTRACT_OBJECTIVE =
  "Company name, country and address, contact email addresses and phone numbers, products sold, producer/exporter/trader, minimum order quantity (MOQ), certifications";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** A site hit belongs to a lead only if the company name appears in its title, host or text. */
export function hitMatchesLead(hit: SearchHit, lead: Pick<Supplier, "name">): boolean {
  if (classifyHit(hit) !== "supplier_site") return false;
  const name = squash(lead.name);
  if (name.length < 5) return false;
  const host = squash((hostOf(hit.url).split(".")[0] as string) ?? "");
  const text = squash(`${hit.title} ${hit.excerpts.join(" ")}`);
  return namesAgree(hit.title, lead.name) || (host.length >= 5 && (name.includes(host) || host.includes(name))) || text.includes(name);
}

export function isRegistryLead(s: Supplier): boolean {
  return !s.domain && s.evidence.some((e) => e.kind === "B" || e.kind === "D");
}

/**
 * Registry and trade-data companies have no website yet. Search for each by name; when a hit
 * clearly belongs to the company, extract its contact details so the site becomes proof A.
 */
export async function resolveRegistryLeads(
  provider: MeteredProvider,
  pool: Pool,
  product: string,
  opts: { maxResolve?: number; log?: (m: string) => void; ingest?: (page: ExtractResult) => void },
): Promise<void> {
  const log = opts.log ?? (() => undefined);
  const leads = [...pool.byKey.values()].filter(isRegistryLead).slice(0, opts.maxResolve ?? 45);
  if (leads.length === 0) return;
  log(`Resolving websites for ${leads.length} registry/trade-data companies`);
  const matched: { lead: Supplier; hit: SearchHit }[] = [];
  try {
    for (const batch of chunk(leads, 3)) {
      const queries = batch.map((l) => `${l.name} ${countryName(l.country) ?? ""} ${product} contact`.replace(/\s+/g, " ").trim());
      let hits: SearchHit[] = [];
      try {
        hits = await provider.search(queries, `Find the official website and contact page of each named ${product} company`);
      } catch (err) {
        if (err instanceof BudgetExceededError) throw err;
        log(`  name search failed: ${(err as Error).message.slice(0, 100)}`);
        continue;
      }
      for (const lead of batch) {
        const hit = hits.find((h) => hitMatchesLead(h, lead));
        if (hit) matched.push({ lead, hit });
      }
    }
    log(`  matched ${matched.length}/${leads.length} companies to a website`);
    const byHost = new Map<string, { lead: Supplier; hit: SearchHit }>();
    for (const m of matched) if (!byHost.has(hostOf(m.hit.url))) byHost.set(hostOf(m.hit.url), m);
    const pages = new Map<string, Supplier>();
    for (const { lead, hit } of byHost.values()) {
      const site = applyOwnSite(pool, hit, false);
      if (!site) continue;
      site.name = lead.name; // the registry's legal name is more reliable than a page title
      site.evidence.push(...lead.evidence);
      for (const [key, value] of pool.byKey.entries()) if (value === lead) pool.byKey.delete(key);
      pages.set(hit.url, site);
    }
    for (const batch of chunk([...pages.keys()], 8)) {
      try {
        const results = await provider.extract(batch, EXTRACT_OBJECTIVE);
        for (const r of results) (opts.ingest ? opts.ingest(r) : applyOwnSite(pool, r, true));
        log(`  extract resolved sites: ${batch.length} urls -> ${results.length} pages`);
      } catch (err) {
        if (err instanceof BudgetExceededError) throw err;
        log(`  extract failed: ${(err as Error).message.slice(0, 100)}`);
      }
    }
    for (const site of pages.values()) {
      if (site.emails.length === 0 && !site.notes.includes("no email found on own site")) site.notes.push("no email found on own site");
    }
  } catch (err) {
    if (!(err instanceof BudgetExceededError)) throw err;
    log("Budget reached while resolving registry leads");
  }
}

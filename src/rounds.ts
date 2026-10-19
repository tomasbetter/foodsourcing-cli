import { classifyAll, hostOf } from "./classify.js";
import { harvestRegistries } from "./harvest.js";
import { ingestPage, isQualified } from "./ingest.js";
import { applyOwnSite, type Pool } from "./resolve.js";
import { BudgetExceededError, type MeteredProvider } from "./providers/index.js";
import { enrichPass, type EnrichConfig } from "./enrich-pass.js";
import { mapLimit } from "./pool.js";
import type { RoundInfo, SearchHit } from "./types.js";

export const EXTRACT_OBJECTIVE =
  "Company name, what the company is (farm, producer, exporter, wholesaler, importer, or a marketplace/agency/news site), products sold, contact email addresses and phone numbers, country and address, minimum order quantity (MOQ), certifications, request-a-quote or product catalog pages";

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const countQualified = (pool: Pool): number => [...pool.byKey.values()].filter(isQualified).length;

export interface RoundState {
  hits: SearchHit[];
  seenUrls: Set<string>;
  extractedHosts: Set<string>;
  rounds: RoundInfo[];
  budgetStopped: boolean;
  enrich?: EnrichConfig;
}

export interface RoundConfig {
  round: number;
  queries: string[];
  objective: string;
  product: string;
  terms: string[];
  batchSize: number;
  maxSites: number;
  /** How many search or extract calls may run at once. */
  concurrency: number;
  log: (m: string) => void;
}

/** One discovery round: search a slice of queries, classify, extract new supplier sites, judge their content. */
export async function runRound(provider: MeteredProvider, pool: Pool, state: RoundState, cfg: RoundConfig): Promise<number> {
  const fresh: SearchHit[] = [];
  const searched = await mapLimit(chunk(cfg.queries, cfg.batchSize), cfg.concurrency, async (batch) => {
    if (state.budgetStopped) return { batch, results: [] as SearchHit[] };
    try {
      return { batch, results: await provider.search(batch, cfg.objective) };
    } catch (err) {
      if (err instanceof BudgetExceededError) state.budgetStopped = true;
      else cfg.log(`  search failed: ${(err as Error).message.slice(0, 120)}`);
      return { batch, results: [] as SearchHit[] };
    }
  });
  for (const { batch, results } of searched) {
    for (const r of results) {
      if (state.seenUrls.has(r.url)) continue;
      state.seenUrls.add(r.url);
      state.hits.push(r);
      fresh.push(r);
    }
    cfg.log(`  round ${cfg.round}: search ${batch.length} queries -> ${results.length} hits`);
  }
  cfg.log(`  round ${cfg.round}: ${searched.length} search calls (up to ${cfg.concurrency} at once), calls ${provider.callsUsed}/${provider.budget}`);
  const classified = classifyAll(fresh);
  const sites = new Map<string, SearchHit>();
  for (const c of classified) {
    const host = hostOf(c.hit.url);
    if (c.cls === "supplier_site" && !sites.has(host) && !state.extractedHosts.has(host)) sites.set(host, c.hit);
  }
  for (const h of sites.values()) applyOwnSite(pool, h, false);
  let extracted = 0;
  if (!state.budgetStopped) {
    const urls = [...sites.values()].slice(0, cfg.maxSites).map((h) => h.url);
    const pages = await mapLimit(chunk(urls, 8), cfg.concurrency, async (batch) => {
      if (state.budgetStopped) return [];
      try {
        return await provider.extract(batch, EXTRACT_OBJECTIVE);
      } catch (err) {
        if (err instanceof BudgetExceededError) state.budgetStopped = true;
        else cfg.log(`  extract failed: ${(err as Error).message.slice(0, 120)}`);
        return [];
      }
    });
    for (const group of pages) for (const p of group) ingestPage(pool, p, cfg.terms);
    extracted = pages.reduce((n, g) => n + g.length, 0);
    cfg.log(`  round ${cfg.round}: extracted ${extracted}/${urls.length} pages (calls ${provider.callsUsed}/${provider.budget})`);
    for (const host of sites.keys()) state.extractedHosts.add(host);
  }
  harvestRegistries(pool, classified, cfg.product);
  if (state.enrich && !state.budgetStopped) await enrichPass(provider, pool, state.enrich, cfg.log);
  const qualified = countQualified(pool);
  state.rounds.push({ round: cfg.round, queries: cfg.queries.length, newHits: fresh.length, extracted, qualified });
  cfg.log(`  round ${cfg.round}: ${qualified} qualified suppliers so far`);
  return qualified;
}

/** Sites that qualified on content but have no contact yet get one more look at their contact page. */
export async function contactPass(provider: MeteredProvider, pool: Pool, terms: string[], maxSites: number, log: (m: string) => void, concurrency = 5): Promise<void> {
  const need = [...pool.byKey.values()].filter((s) => s.website && s.assessment?.kind === "supplier" && s.emails.length === 0 && s.phones.length === 0);
  if (need.length === 0) return;
  const groups = await mapLimit(chunk(need.slice(0, maxSites).map((s) => `${s.website}/contact`), 8), concurrency, async (batch) => {
    try {
      return await provider.extract(batch, EXTRACT_OBJECTIVE);
    } catch (err) {
      if (!(err instanceof BudgetExceededError)) log(`  contact pass failed: ${(err as Error).message.slice(0, 100)}`);
      return [];
    }
  });
  for (const g of groups) for (const p of g) ingestPage(pool, p, terms);
  log(`  contact pass: ${groups.reduce((n, g) => n + g.length, 0)} pages`);
}

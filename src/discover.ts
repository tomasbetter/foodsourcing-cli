import { classifyAll } from "./classify.js";
import { ingestPage, isQualified, isRejected } from "./ingest.js";
import { newPool } from "./resolve.js";
import { resolveRegistryLeads } from "./resolve-leads.js";
import { planQueries, productTerms, type PlanOptions } from "./planner.js";
import type { MeteredProvider } from "./providers/index.js";
import { contactPass, runRound, type RoundState } from "./rounds.js";
import { enrichPass } from "./enrich-pass.js";
import { clampConcurrency } from "./pool.js";
import { applyVerdict } from "./verify.js";
import type { DiscoveryFile, Supplier } from "./types.js";

export interface DiscoverOptions extends PlanOptions {
  budget: number;
  /** Stop once this many suppliers pass the content-based quality gate. */
  target?: number;
  maxRounds?: number;
  batchSize?: number;
  maxSites?: number;
  maxResolve?: number;
  /** Parallel search/extract calls (1-50, default 10) and parallel Task runs (default 20). */
  concurrency?: number;
  /** Queries searched per round when --target is set (default 18). Independent of concurrency. */
  roundQueries?: number;
  enrichConcurrency?: number;
  /** Judge candidate sites with the Parallel Task API (default: on when the provider supports it). */
  enrich?: boolean;
  enrichProcessor?: string;
  maxEnrich?: number;
  log?: (message: string) => void;
}

function rank(s: Supplier): number {
  const q = s.qualified ? 10 : 0;
  return q + ({ verified: 5, corroborated: 4, needs_review: 3, lead: 2, stale: 1, rejected: 0 } as const)[s.status];
}

export async function discover(provider: MeteredProvider, product: string, opts: DiscoverOptions): Promise<DiscoveryFile> {
  const log = opts.log ?? (() => undefined);
  const startedAt = new Date().toISOString();
  const target = opts.target ?? 0;
  const plan = planQueries(product, opts);
  const terms = productTerms(plan.product);
  log(`Planned ${plan.queries.length} queries (${plan.countries.join(", ")}; languages: ${plan.languages.join(", ")})${target ? `; target ${target} qualified suppliers` : ""}`);

  const concurrency = clampConcurrency(opts.concurrency);
  const batchSize = opts.batchSize ?? 3;
  const perRound = Math.max(opts.roundQueries ?? 18, batchSize);
  const maxRounds = opts.maxRounds ?? (target ? 12 : 1);
  const objective = `Find real ${plan.product} suppliers (farms, producers, exporters, importers, wholesalers) with company websites and contact details`;
  const pool = newPool();
  const useEnrich = (opts.enrich ?? true) && provider.canEnrich;
  const state: RoundState = {
    hits: [], seenUrls: new Set(), extractedHosts: new Set(), rounds: [], budgetStopped: false,
    enrich: useEnrich ? { processor: opts.enrichProcessor ?? "base", product: plan.product, max: opts.maxEnrich ?? 40, done: 0, failed: 0, concurrency: clampConcurrency(opts.enrichConcurrency) } : undefined,
  };
  if (opts.enrich && !provider.canEnrich) log(`Provider ${provider.name} does not support enrichment; using page-content checks only`);
  let cursor = 0;

  for (let round = 1; round <= maxRounds && !state.budgetStopped; round++) {
    const queries = target ? plan.queries.slice(cursor, cursor + perRound) : plan.queries;
    if (queries.length === 0) {
      log("No more query variants to try");
      break;
    }
    cursor += queries.length;
    const qualified = await runRound(provider, pool, state, { round, queries, objective, product: plan.product, terms, batchSize, maxSites: opts.maxSites ?? 40, concurrency, log });
    if (!target || qualified >= target) break;
  }

  if (!state.budgetStopped) await contactPass(provider, pool, terms, opts.maxSites ?? 16, log, concurrency);
  if (!state.budgetStopped) {
    await resolveRegistryLeads(provider, pool, plan.product, { maxResolve: opts.maxResolve, log, ingest: (p) => void ingestPage(pool, p, terms) });
  }

  if (state.enrich && !state.budgetStopped) await enrichPass(provider, pool, state.enrich, log);

  const suppliers = [...pool.byKey.values()].map((s) => {
    const v = applyVerdict(s);
    v.qualified = isQualified(v) && !isRejected(v);
    return v;
  });
  suppliers.sort((a, b) => rank(b) - rank(a) || b.confidence - a.confidence || a.name.localeCompare(b.name));
  const classCounts: Record<string, number> = {};
  for (const c of classifyAll(state.hits)) classCounts[c.cls] = (classCounts[c.cls] ?? 0) + 1;
  log(`Classified ${state.hits.length} hits: ${Object.entries(classCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  return {
    product: plan.product,
    generatedAt: new Date().toISOString(),
    suppliers,
    run: {
      product: plan.product,
      provider: provider.name,
      startedAt,
      finishedAt: new Date().toISOString(),
      budget: provider.budget,
      callsUsed: provider.callsUsed,
      cacheHits: provider.cacheHits,
      failures: provider.failures,
      queries: plan.queries.slice(0, cursor || plan.queries.length),
      hits: state.hits.length,
      hitClasses: classCounts,
      calls: provider.calls,
      target: target || undefined,
      qualified: suppliers.filter((s) => s.qualified).length,
      rounds: state.rounds,
      enriched: state.enrich?.done,
      enrichCalls: provider.calls.filter((c) => c.tool === "enrich" && !c.cached).length,
    },
  };
}

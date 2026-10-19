import { applyEnrichment } from "./apply-enrichment.js";
import { isNegative } from "./ingest.js";
import { mapLimit } from "./pool.js";
import { BudgetExceededError, type MeteredProvider } from "./providers/index.js";
import type { Pool } from "./resolve.js";
import type { Supplier } from "./types.js";

export interface EnrichConfig {
  processor: string;
  product: string;
  /** Hard cap on sites judged in one run; each site is one billed Task run. */
  max: number;
  done: number;
  failed: number;
  /** Task runs in flight at once. */
  concurrency?: number;
}

function priority(s: Supplier): number {
  return (s.assessment?.kind === "supplier" ? 2 : 0) + (s.emails.length > 0 || s.phones.length > 0 ? 1 : 0);
}

/** Sites worth a Task run: has a website, not judged yet, not already clearly a non-supplier. */
export function enrichCandidates(pool: Pool): Supplier[] {
  return [...pool.byKey.values()]
    .filter((s) => s.website && !s.enrichment && !isNegative(s.assessment))
    .sort((a, b) => priority(b) - priority(a));
}

/**
 * Judge new candidate sites with the Task API, one run per site, `concurrency` at a time.
 * Each result is applied as soon as it arrives. A failed or slow site stays unjudged and keeps
 * its page-content assessment. Returns the number of sites judged in this pass.
 */
export async function enrichPass(provider: MeteredProvider, pool: Pool, cfg: EnrichConfig, log: (m: string) => void): Promise<number> {
  if (!provider.canEnrich || cfg.done >= cfg.max) return 0;
  const todo = enrichCandidates(pool).slice(0, cfg.max - cfg.done);
  if (todo.length === 0) return 0;
  const width = cfg.concurrency ?? 20;
  log(`  enrich: judging ${todo.length} sites, up to ${width} at once (${cfg.processor})`);
  let judged = 0;
  let stopped = false;
  await mapLimit(todo, width, async (s) => {
    if (stopped) return;
    try {
      const [r] = await provider.enrich([s.website as string], { processor: cfg.processor, product: cfg.product });
      cfg.done++;
      if (r?.enrichment) {
        applyEnrichment(s, r.enrichment);
        judged++;
      } else {
        cfg.failed++;
        s.notes.push(`task enrichment failed: ${r?.error ?? "unknown"}`);
      }
    } catch (err) {
      cfg.done++;
      if (err instanceof BudgetExceededError) {
        stopped = true;
        return;
      }
      cfg.failed++;
      s.notes.push(`task enrichment failed: ${(err as Error).message.slice(0, 100)}`);
    }
  });
  log(`  enrich: judged ${judged}/${todo.length} sites${cfg.failed ? `, ${cfg.failed} failed` : ""}${stopped ? ", call budget reached" : ""} (${cfg.done}/${cfg.max} used)`);
  return judged;
}

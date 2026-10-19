import type { CallRecord, EnrichOptions, EnrichResult, ExtractResult, SearchHit } from "../types.js";

export interface Provider {
  readonly name: string;
  search(queries: string[], objective?: string): Promise<SearchHit[]>;
  extract(urls: string[], objective: string): Promise<ExtractResult[]>;
  /** Optional: judge each company website with a structured, cited research task. */
  enrich?(urls: string[], opts: EnrichOptions): Promise<EnrichResult[]>;
}

export class BudgetExceededError extends Error {
  constructor(budget: number) {
    super(`Call budget of ${budget} reached`);
    this.name = "BudgetExceededError";
  }
}

/** Wraps a provider with a call budget, call log, retries and an optional on-disk cache. */
export class MeteredProvider implements Provider {
  readonly calls: CallRecord[] = [];
  cacheHits = 0;
  private used = 0;
  private itemFailures = 0;

  constructor(
    private readonly inner: Provider,
    readonly budget: number,
    private readonly cache?: { get(key: string): unknown | undefined; set(key: string, value: unknown): void },
    private readonly retries = 2,
    private readonly baseDelayMs = 1500,
  ) {}

  get name(): string {
    return this.inner.name;
  }

  get callsUsed(): number {
    return this.used;
  }

  get failures(): number {
    return this.calls.filter((c) => !c.ok).length + this.itemFailures;
  }

  get remaining(): number {
    return Math.max(0, this.budget - this.used);
  }

  search(queries: string[], objective?: string): Promise<SearchHit[]> {
    return this.run("search", queries.length, JSON.stringify({ queries, objective }), () =>
      this.inner.search(queries, objective),
    );
  }

  extract(urls: string[], objective: string): Promise<ExtractResult[]> {
    return this.run("extract", urls.length, JSON.stringify({ urls, objective }), () =>
      this.inner.extract(urls, objective),
    );
  }

  get canEnrich(): boolean {
    return typeof this.inner.enrich === "function";
  }

  /** Enrichment is billed per site and each site fails on its own, so it is metered per call, not per site. */
  async enrich(urls: string[], opts: EnrichOptions): Promise<EnrichResult[]> {
    const inner = this.inner;
    if (!inner.enrich) throw new Error(`provider ${inner.name} does not support enrichment`);
    const results = await this.run("enrich", urls.length, JSON.stringify({ urls, opts }), () => (inner.enrich as NonNullable<Provider["enrich"]>)(urls, opts));
    // enrich() reports each site's error in its result instead of throwing, so count those here.
    this.itemFailures += results.filter((r) => !r.enrichment).length;
    return results;
  }

  private async run<T>(tool: "search" | "extract" | "enrich", items: number, key: string, fn: () => Promise<T>): Promise<T> {
    const cacheKey = `${this.inner.name}:${tool}:${key}`;
    const cached = this.cache?.get(cacheKey) as T | undefined;
    if (cached !== undefined) {
      this.cacheHits++;
      this.calls.push({ tool, items, ok: true, cached: true, ms: 0 });
      return cached;
    }
    let lastError = "";
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (this.used >= this.budget) throw new BudgetExceededError(this.budget);
      this.used++;
      const started = Date.now();
      try {
        const value = await fn();
        this.calls.push({ tool, items, ok: true, cached: false, ms: Date.now() - started });
        this.cache?.set(cacheKey, value);
        return value;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        this.calls.push({ tool, items, ok: false, cached: false, ms: Date.now() - started, error: lastError.slice(0, 300) });
        if (attempt < this.retries) await new Promise((r) => setTimeout(r, this.baseDelayMs * 2 ** attempt));
      }
    }
    throw new Error(`${tool} failed after ${this.retries + 1} attempts: ${lastError}`);
  }
}

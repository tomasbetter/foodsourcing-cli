import { buildTaskSpec, parseTaskResult, taskInput } from "../enrich.js";
import type { EnrichOptions, EnrichResult, ExtractResult, SearchHit } from "../types.js";
import type { Provider } from "./types.js";

const BASE_URL = "https://api.parallel.ai";

interface RawResult {
  url?: string;
  title?: string | null;
  excerpts?: string[] | null;
}

/** Calls the Parallel Search and Extract APIs directly with the caller's own API key. */
export class ParallelProvider implements Provider {
  readonly name = "parallel";

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error("PARALLEL_API_KEY is not set");
  }

  async search(queries: string[], objective?: string): Promise<SearchHit[]> {
    const body: Record<string, unknown> = { search_queries: queries };
    if (objective) body.objective = objective;
    const data = await this.post("/v1/search", body);
    return toResults(data).map((r) => ({ ...r, query: queries.join(" | ") }));
  }

  async extract(urls: string[], objective: string): Promise<ExtractResult[]> {
    const data = await this.post("/v1/extract", { urls, objective });
    return toResults(data);
  }

  /** Starts one Task run per site, then waits for each result. A failed site returns an error entry, not an exception. */
  async enrich(urls: string[], opts: EnrichOptions): Promise<EnrichResult[]> {
    const spec = buildTaskSpec(opts.product);
    return Promise.all(
      urls.map(async (url): Promise<EnrichResult> => {
        try {
          const run = (await this.post("/v1/tasks/runs", { input: taskInput(url, opts.product), processor: opts.processor, task_spec: spec })) as { run_id?: string };
          if (!run.run_id) return { url, error: "no run_id returned" };
          for (let attempt = 0; attempt < 10; attempt++) {
            const res = await fetch(`${BASE_URL}/v1/tasks/runs/${run.run_id}/result?timeout=60`, { headers: { "x-api-key": this.apiKey } });
            if (res.status === 408 || res.status === 504) continue;
            if (!res.ok) return { url, error: `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 120)}` };
            const enrichment = parseTaskResult(await res.json(), opts.processor);
            return enrichment ? { url, enrichment } : { url, error: "result had no usable content" };
          }
          return { url, error: "timed out waiting for the task result" };
        } catch (err) {
          return { url, error: (err as Error).message.slice(0, 160) };
        }
      }),
    );
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Parallel ${path} returned HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }
}

export function toResults(data: unknown): { url: string; title: string; excerpts: string[] }[] {
  const results = ((data as { results?: RawResult[] } | null)?.results ?? []) as RawResult[];
  return results
    .filter((r) => typeof r.url === "string" && r.url.length > 0)
    .map((r) => ({
      url: r.url as string,
      title: r.title ?? "",
      excerpts: Array.isArray(r.excerpts) ? r.excerpts.filter((e): e is string => typeof e === "string") : [],
    }));
}

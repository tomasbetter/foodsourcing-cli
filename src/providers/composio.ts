import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildTaskSpec, parseTaskResult, taskInput } from "../enrich.js";
import type { EnrichOptions, EnrichResult, ExtractResult, SearchHit } from "../types.js";
import type { Provider } from "./types.js";
import { toResults } from "./parallel.js";

const execFileAsync = promisify(execFile);

/**
 * Optional provider that reuses a logged-in Composio CLI with a linked "parallel" toolkit
 * account. No API key is read or stored by this project.
 */
export class ComposioProvider implements Provider {
  readonly name = "composio";

  constructor(private readonly bin = process.env.COMPOSIO_BIN || "composio") {}

  async search(queries: string[]): Promise<SearchHit[]> {
    const data = await this.execute("PARALLEL_SEARCH", { search_queries: queries });
    return toResults(data).map((r) => ({ ...r, query: queries.join(" | ") }));
  }

  async extract(urls: string[], objective: string): Promise<ExtractResult[]> {
    const data = await this.execute("PARALLEL_EXTRACT", { urls, objective, excerpts: true });
    return toResults(data);
  }

  /** Creates the runs with the toolkit, then reads each result through the authenticated proxy (GET only). */
  async enrich(urls: string[], opts: EnrichOptions): Promise<EnrichResult[]> {
    const spec = buildTaskSpec(opts.product);
    return Promise.all(
      urls.map(async (url): Promise<EnrichResult> => {
        try {
          const created = (await this.execute("PARALLEL_CREATE_TASK_RUN", { processor: opts.processor, input: taskInput(url, opts.product), task_spec: spec })) as { run_id?: string };
          if (!created?.run_id) return { url, error: "no run_id returned" };
          const { stdout } = await execFileAsync(this.bin, ["proxy", `https://api.parallel.ai/v1/tasks/runs/${created.run_id}/result`, "--toolkit", "parallel", "-X", "GET"], {
            maxBuffer: 64 * 1024 * 1024,
            timeout: 600_000,
            killSignal: "SIGKILL",
          });
          const enrichment = parseTaskResult(JSON.parse(stdout), opts.processor);
          return enrichment ? { url, enrichment } : { url, error: "result had no usable content" };
        } catch (err) {
          return { url, error: (err as Error).message.slice(0, 160) };
        }
      }),
    );
  }

  private async execute(slug: string, args: Record<string, unknown>): Promise<unknown> {
    const { stdout } = await execFileAsync(this.bin, ["execute", slug, "-d", JSON.stringify(args)], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 180_000,
    });
    let parsed: { successful?: boolean; error?: string | null; data?: unknown };
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new Error(`Composio returned non-JSON output: ${stdout.slice(0, 200)}`);
    }
    if (!parsed.successful) throw new Error(`Composio ${slug} failed: ${parsed.error ?? "unknown error"}`);
    return parsed.data;
  }
}

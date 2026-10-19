import { execFile } from "node:child_process";
import { buildTaskSpec, parseTaskResult, taskInput } from "../enrich.js";
import type { EnrichOptions, EnrichResult, ExtractResult, SearchHit } from "../types.js";
import type { Provider } from "./types.js";
import { toResults } from "./parallel.js";

/** Runs the composio CLI with these arguments and returns stdout. Injectable so tests need no CLI. */
export type CliRunner = (args: string[], timeoutMs: number) => Promise<string>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Optional provider that reuses a logged-in Composio CLI with a linked "parallel" toolkit
 * account. No API key is read or stored by this project.
 */
export class ComposioProvider implements Provider {
  readonly name = "composio";
  private readonly runCli: CliRunner;

  constructor(
    bin = process.env.COMPOSIO_BIN || "composio",
    runCli?: CliRunner,
    private readonly pollMs = 8000,
    private readonly maxWaitMs = 600_000,
  ) {
    this.runCli =
      runCli ??
      ((args, timeoutMs) =>
        new Promise<string>((resolve, reject) => {
          const child = execFile(bin, args, { maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs, killSignal: "SIGKILL" }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
          // `composio proxy` waits for stdin to close before it returns (observed: a 1.5 s call hung until killed).
          child.stdin?.end();
        }));
  }

  async search(queries: string[]): Promise<SearchHit[]> {
    const data = await this.execute("PARALLEL_SEARCH", { search_queries: queries });
    return toResults(data).map((r) => ({ ...r, query: queries.join(" | ") }));
  }

  async extract(urls: string[], objective: string): Promise<ExtractResult[]> {
    const data = await this.execute("PARALLEL_EXTRACT", { urls, objective, excerpts: true });
    return toResults(data);
  }

  /**
   * Creates one Task run per site with the toolkit, then polls the run's status (a quick GET) and
   * reads the result once it is completed. The blocking /result endpoint is not used: through the
   * proxy it was observed to hold the connection for minutes after the run had finished.
   */
  async enrich(urls: string[], opts: EnrichOptions): Promise<EnrichResult[]> {
    const spec = buildTaskSpec(opts.product);
    return Promise.all(
      urls.map(async (url): Promise<EnrichResult> => {
        try {
          const created = (await this.execute("PARALLEL_CREATE_TASK_RUN", { processor: opts.processor, input: taskInput(url, opts.product), task_spec: spec })) as { run_id?: string };
          if (!created?.run_id) return { url, error: "no run_id returned" };
          const base = `https://api.parallel.ai/v1/tasks/runs/${created.run_id}`;
          const deadline = Date.now() + this.maxWaitMs;
          for (;;) {
            const status = unwrap(JSON.parse(await this.proxyGet(base))) as { status?: string; errors?: { message?: string }[] | null };
            if (status.status === "completed") {
              const enrichment = parseTaskResult(JSON.parse(await this.proxyGet(`${base}/result`)), opts.processor);
              return enrichment ? { url, enrichment } : { url, error: "result had no usable content" };
            }
            if (status.status === "failed") return { url, error: `task failed: ${status.errors?.[0]?.message ?? "unknown"}`.slice(0, 160) };
            if (Date.now() + this.pollMs > deadline) return { url, error: `timed out after ${Math.round(this.maxWaitMs / 1000)}s waiting for the task (status ${status.status ?? "unknown"})` };
            await sleep(this.pollMs + Math.floor(Math.random() * 1000));
          }
        } catch (err) {
          return { url, error: (err as Error).message.slice(0, 160) };
        }
      }),
    );
  }

  private proxyGet(url: string): Promise<string> {
    return this.runCli(["proxy", url, "--toolkit", "parallel", "-X", "GET"], 120_000);
  }

  private async execute(slug: string, args: Record<string, unknown>): Promise<unknown> {
    const stdout = await this.runCli(["execute", slug, "-d", JSON.stringify(args)], 180_000);
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

function unwrap(v: unknown): unknown {
  const inner = (v as { data?: unknown } | null)?.data;
  return inner && typeof inner === "object" ? inner : v;
}

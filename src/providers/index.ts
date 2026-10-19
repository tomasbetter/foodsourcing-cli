import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ComposioProvider } from "./composio.js";
import { ParallelProvider } from "./parallel.js";
import { MeteredProvider, type Provider } from "./types.js";

export type { Provider } from "./types.js";
export { MeteredProvider, BudgetExceededError } from "./types.js";

export function resolveProviderName(env: NodeJS.ProcessEnv = process.env): "parallel" | "composio" {
  const forced = (env.FOODSOURCING_PROVIDER ?? "").trim().toLowerCase();
  if (forced === "parallel" || forced === "composio") return forced;
  return env.PARALLEL_API_KEY ? "parallel" : "composio";
}

export function createProvider(env: NodeJS.ProcessEnv = process.env): Provider {
  const name = resolveProviderName(env);
  if (name === "parallel") return new ParallelProvider(env.PARALLEL_API_KEY ?? "");
  return new ComposioProvider(env.COMPOSIO_BIN || "composio");
}

export class DiskCache {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private file(key: string): string {
    return join(this.dir, `${createHash("sha256").update(key).digest("hex")}.json`);
  }

  get(key: string): unknown | undefined {
    const f = this.file(key);
    if (!existsSync(f)) return undefined;
    try {
      return JSON.parse(readFileSync(f, "utf8"));
    } catch {
      return undefined;
    }
  }

  set(key: string, value: unknown): void {
    writeFileSync(this.file(key), JSON.stringify(value));
  }
}

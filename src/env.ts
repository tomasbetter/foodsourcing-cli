import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Minimal .env loader. Real environment variables always win; no secrets are ever written. */
export function loadDotEnv(dir = process.cwd(), env: NodeJS.ProcessEnv = process.env): void {
  const file = join(dir, ".env");
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (value && env[key] === undefined) env[key] = value;
  }
}

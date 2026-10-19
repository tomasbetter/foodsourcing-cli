import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ComposioProvider } from "../src/providers/composio.js";

// A stand-in `composio` that, like the real `composio proxy`, only answers once its stdin is closed.
function fakeComposio(): string {
  const dir = mkdtempSync(join(tmpdir(), "fs-composio-"));
  const file = join(dir, "composio");
  writeFileSync(
    file,
    `#!/usr/bin/env node
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  const args = process.argv.slice(2);
  if (args[0] === "execute") console.log(JSON.stringify({ successful: true, data: { results: [{ url: "https://a.example", title: "A", excerpts: ["x"] }] } }));
  else console.log(JSON.stringify({ data: { status: "completed" } }));
});
`,
  );
  chmodSync(file, 0o755);
  return file;
}

test("the real command runner closes stdin so a CLI that waits for EOF does not hang", async () => {
  const provider = new ComposioProvider(fakeComposio());
  const started = Date.now();
  const hits = await provider.search(["anything"]);
  assert.equal(hits.length, 1);
  assert.ok(Date.now() - started < 10_000, "returned promptly");
});

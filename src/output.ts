import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { countryName } from "./countries.js";
import { independentProofs } from "./verify.js";
import type { DiscoveryFile, Supplier } from "./types.js";

export const CSV_COLUMNS = [
  "name", "status", "quality", "confidence", "task_type", "task_confidence", "types", "country", "website", "emails", "phones", "moq",
  "certifications", "proofs", "evidence_urls", "notes",
] as const;

function csvCell(value: unknown): string {
  const s = value === undefined || value === null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function supplierRow(s: Supplier): Record<(typeof CSV_COLUMNS)[number], string> {
  const proofs = independentProofs(s.evidence).map((e) => e.kind).join("+");
  return {
    name: s.name,
    status: s.status,
    quality: s.qualified ? "qualified" : "unconfirmed",
    confidence: s.confidence.toFixed(2),
    task_type: s.enrichment?.organizationType ?? "",
    task_confidence: s.enrichment?.confidence ?? "",
    types: s.labels.filter((l) => l.type !== "unknown" || s.labels.length === 1).map((l) => `${l.type}(${l.confidence.toFixed(1)})`).join("; "),
    country: countryName(s.country) ?? s.country ?? "",
    website: s.website ?? "",
    emails: s.emails.join("; "),
    phones: s.phones.join("; "),
    moq: s.moq ?? "",
    certifications: s.certifications.join("; "),
    proofs,
    evidence_urls: [...new Set(s.evidence.map((e) => e.url))].join(" | "),
    notes: s.notes.join(" | "),
  };
}

export function toCsv(suppliers: Supplier[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const s of suppliers.filter((x) => x.status !== "rejected")) {
    const row = supplierRow(s);
    lines.push(CSV_COLUMNS.map((c) => csvCell(row[c])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "product";
}

export function writeDiscovery(outDir: string, file: DiscoveryFile): { json: string; csv: string; evidence: string } {
  mkdirSync(outDir, { recursive: true });
  const base = slugify(file.product);
  const json = join(outDir, `${base}.json`);
  const csv = join(outDir, `${base}.csv`);
  const evidence = join(outDir, `${base}.evidence.json`);
  writeFileSync(json, JSON.stringify(file, null, 2));
  writeFileSync(csv, toCsv(file.suppliers));
  writeFileSync(evidence, JSON.stringify(file.suppliers.map((s) => ({ id: s.id, name: s.name, status: s.status, evidence: s.evidence })), null, 2));
  return { json, csv, evidence };
}

export function readDiscovery(path: string): DiscoveryFile {
  return JSON.parse(readFileSync(path, "utf8")) as DiscoveryFile;
}

export function saveDiscovery(path: string, file: DiscoveryFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(file, null, 2));
}

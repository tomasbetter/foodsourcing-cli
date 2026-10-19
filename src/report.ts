import { countryName } from "./countries.js";
import type { DiscoveryFile } from "./types.js";

export interface ReportStats {
  product: string;
  provider: string;
  hits: number;
  supplierSiteHits: number;
  supplierSiteRatio: number;
  suppliers: number;
  byStatus: Record<string, number>;
  verified: number;
  qualified: number;
  enriched: number;
  rejected: number;
  verifiedCountries: string[];
  verifiedWithContact: number;
  contactCoverage: number;
  callsUsed: number;
  budget: number;
  cacheHits: number;
  failures: number;
  failureRate: number;
  callsPerVerified: number | null;
}

export function computeStats(f: DiscoveryFile): ReportStats {
  const byStatus: Record<string, number> = {};
  for (const s of f.suppliers) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
  const verified = f.suppliers.filter((s) => s.status === "verified");
  const withContact = verified.filter((s) => s.emails.length > 0 || s.phones.length > 0);
  const countries = [...new Set(verified.map((s) => countryName(s.country) ?? s.country).filter((c): c is string => Boolean(c)))];
  const siteHits = f.run.hitClasses.supplier_site ?? 0;
  const liveCalls = f.run.calls.filter((c) => !c.cached).length;
  return {
    product: f.product,
    provider: f.run.provider,
    hits: f.run.hits,
    supplierSiteHits: siteHits,
    supplierSiteRatio: f.run.hits > 0 ? siteHits / f.run.hits : 0,
    suppliers: f.suppliers.length,
    byStatus,
    verified: verified.length,
    qualified: f.suppliers.filter((s) => s.qualified).length,
    enriched: f.suppliers.filter((s) => s.enrichment).length,
    rejected: byStatus.rejected ?? 0,
    verifiedCountries: countries,
    verifiedWithContact: withContact.length,
    contactCoverage: verified.length > 0 ? withContact.length / verified.length : 0,
    callsUsed: f.run.callsUsed,
    budget: f.run.budget,
    cacheHits: f.run.cacheHits,
    failures: f.run.failures,
    failureRate: liveCalls > 0 ? f.run.failures / liveCalls : 0,
    callsPerVerified: verified.length > 0 ? f.run.callsUsed / verified.length : null,
  };
}

const pct = (n: number): string => `${Math.round(n * 100)}%`;

export function renderReport(files: DiscoveryFile[]): string {
  const lines: string[] = ["# Discovery pilot report", ""];
  lines.push("| Product | Hits | Supplier-site hits | Suppliers | Qualified | Rejected | Verified | Countries (verified) | Contact coverage | Calls | Failures |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  const all = files.map(computeStats);
  for (const s of all) {
    lines.push(`| ${s.product} | ${s.hits} | ${s.supplierSiteHits} (${pct(s.supplierSiteRatio)}) | ${s.suppliers} | ${s.qualified} | ${s.rejected} | ${s.verified} | ${s.verifiedCountries.length} | ${pct(s.contactCoverage)} | ${s.callsUsed}/${s.budget} | ${s.failures} (${pct(s.failureRate)}) |`);
  }
  lines.push("");
  for (const s of all) {
    lines.push(`## ${s.product}`);
    lines.push(`- Provider: ${s.provider}; cache hits: ${s.cacheHits}; sites judged by the Task API: ${s.enriched}`);
    lines.push(`- Status counts: ${Object.entries(s.byStatus).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`);
    lines.push(`- Verified countries: ${s.verifiedCountries.join(", ") || "none"}`);
    lines.push(`- Calls per verified supplier: ${s.callsPerVerified === null ? "n/a (no verified suppliers)" : s.callsPerVerified.toFixed(1)}`);
    lines.push("");
  }
  lines.push("Success targets: 30+ verified suppliers per product across 5+ countries, 80%+ of verified with a contact from the company's own site, 90%+ label accuracy on a manual 20-supplier spot check.");
  lines.push("Verified means two independent sources agree, not that the supplier is endorsed.");
  return `${lines.join("\n")}\n`;
}

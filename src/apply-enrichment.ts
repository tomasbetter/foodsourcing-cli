import { isoFromName } from "./countries.js";
import { findEmails } from "./extract.js";
import type { Enrichment, PageKind, Supplier, SupplierType } from "./types.js";

const REAL_TYPES: Record<string, SupplierType> = {
  farm_or_grower: "farm",
  processor_or_packer: "processor",
  exporter: "exporter",
  importer: "importer",
  wholesaler_or_distributor: "wholesaler",
  trader_or_broker: "trader",
};

const NEGATIVE_KINDS: Record<string, PageKind> = {
  marketplace_or_directory: "platform",
  trade_data_platform: "platform",
  government_agency_or_association: "agency",
  news_or_media: "news",
  software_or_service: "software",
};

export const isRealType = (type: string): boolean => type in REAL_TYPES;

/** Apply a Task judgement to a supplier. It replaces the keyword-based page assessment. */
export function applyEnrichment(s: Supplier, e: Enrichment): void {
  s.enrichment = e;
  if (e.confidence === "low" && s.assessment && s.assessment.kind !== "unknown") {
    s.notes.push("task result had low confidence; kept the earlier page assessment");
    return;
  }
  let kind: PageKind = "unknown";
  if (isRealType(e.organizationType)) kind = e.sellsToBusinesses === "yes" && e.sellsProduct !== "no" ? "supplier" : "unknown";
  else if (e.organizationType in NEGATIVE_KINDS) kind = NEGATIVE_KINDS[e.organizationType] as PageKind;
  s.assessment = {
    kind,
    commercialSignals: s.assessment?.commercialSignals ?? 0,
    reasons: [`task(${e.processor}): ${e.organizationType}; sells to businesses: ${e.sellsToBusinesses}; sells product: ${e.sellsProduct}; confidence ${e.confidence}`],
  };
  if (kind !== "supplier") return;
  const weight = e.confidence === "high" ? 0.9 : e.confidence === "medium" ? 0.7 : 0.5;
  s.labels = [{ type: REAL_TYPES[e.organizationType] as SupplierType, confidence: weight }];
  const hasRegistry = s.evidence.some((ev) => ev.kind === "B" || ev.kind === "D");
  if (e.companyName && e.companyName.length <= 80 && !hasRegistry) s.name = e.companyName;
  const iso = e.country ? isoFromName(e.country) : undefined;
  if (iso) {
    s.country = iso;
    s.countrySignals = [...new Set([...s.countrySignals, `task:${iso}`])];
  }
  for (const m of findEmails(e.contactEmail)) if (!s.emails.includes(m)) s.emails.push(m);
  if (e.moq && !s.moq) s.moq = e.moq.slice(0, 90);
  const certs = e.certifications.split(/[,;]/).map((c) => c.trim()).filter(Boolean);
  s.certifications = [...new Set([...s.certifications, ...certs])].slice(0, 12);
}

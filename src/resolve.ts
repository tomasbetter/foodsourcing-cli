import { countryFromHost } from "./countries.js";
import { classifyHit, hostOf } from "./classify.js";
import { cleanText, findCertifications, findEmails, findMoq, findPhones, guessCountry, guessName, labelTypes } from "./extract.js";
import { normalizeName } from "./verify.js";
import type { Evidence, EvidenceKind, ExtractResult, HitClass, SearchHit, Supplier } from "./types.js";

const COMPANY_RE =
  /\b([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ&.'-]*(?:\s+[A-ZÁÉÍÓÚÑ&][A-Za-zÁÉÍÓÚÑáéíóúñ&.'-]*){0,5}\s+(?:S\.?A\.?S?\.?|CIA\.?\s+LTDA\.?|LTDA\.?|S\.?R\.?L\.?|GMBH|LTD\.?|UAB|S\.?L\.?))(?=[\s,;.)]|$)/g;

export function slug(value: string): string {
  return normalizeName(value).replace(/\s+/g, "-") || "unknown";
}

export function newSupplier(name: string, website?: string): Supplier {
  const domain = website ? hostOf(website) : undefined;
  return {
    id: domain ?? slug(name),
    name,
    website,
    domain,
    country: undefined,
    countrySignals: [],
    labels: [{ type: "unknown", confidence: 0.2 }],
    emails: [],
    phones: [],
    certifications: [],
    evidence: [],
    status: "lead",
    confidence: 0.2,
    notes: [],
    lastVerified: new Date().toISOString(),
  };
}

export function makeEvidence(kind: EvidenceKind, url: string, excerpt: string, extra: Partial<Evidence> = {}): Evidence {
  return { kind, url, excerpt: cleanText(excerpt).slice(0, 240), retrievedAt: new Date().toISOString(), ...extra };
}

/** Company names listed in a registry or shipment-record page. */
export function companyNamesIn(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(COMPANY_RE)) {
    const name = (m[1] as string).replace(/\s+/g, " ").trim();
    if (name.length >= 6 && name.length <= 80) names.add(name);
  }
  return [...names];
}

export interface Pool {
  byKey: Map<string, Supplier>;
}

export function newPool(): Pool {
  return { byKey: new Map() };
}

function keyFor(s: { domain?: string; name: string }): string {
  return s.domain ?? `name:${normalizeName(s.name)}`;
}

export function upsert(pool: Pool, candidate: Supplier): Supplier {
  const key = keyFor(candidate);
  const existing = pool.byKey.get(key);
  if (!existing) {
    pool.byKey.set(key, candidate);
    return candidate;
  }
  existing.evidence.push(...candidate.evidence);
  for (const e of candidate.emails) if (!existing.emails.includes(e)) existing.emails.push(e);
  for (const p of candidate.phones) if (!existing.phones.includes(p)) existing.phones.push(p);
  return existing;
}

/** Create or update a supplier record from its own site (evidence A needs a contact signal). */
const NOT_OWNED: HitClass[] = ["directory", "marketplace", "trade_data", "registry", "news_reference"];

/** True when a URL is a directory, marketplace, social or reference page rather than a company's own site. */
export function isThirdPartyHost(url: string): boolean {
  const cls = classifyHit({ url, title: "", excerpts: ["wholesale supplier"] });
  return NOT_OWNED.includes(cls);
}

export function applyOwnSite(pool: Pool, hit: SearchHit | ExtractResult, extracted: boolean): Supplier | undefined {
  if (isThirdPartyHost(hit.url)) return undefined;
  const host = hostOf(hit.url);
  const text = cleanText(hit.excerpts.join(" "));
  const candidate = newSupplier(guessName(hit.title, host), `https://${host}`);
  const s = upsert(pool, candidate);
  const emails = findEmails(hit.excerpts.join(" ")).filter((e) => e.endsWith(host) || host.endsWith(e.split("@")[1] ?? "~"));
  const allEmails = findEmails(hit.excerpts.join(" "));
  const phones = findPhones(text);
  for (const e of allEmails) if (!s.emails.includes(e)) s.emails.push(e);
  for (const p of phones) if (!s.phones.includes(p)) s.phones.push(p);
  s.certifications = [...new Set([...s.certifications, ...findCertifications(text)])];
  s.moq = s.moq ?? findMoq(text);
  const labels = labelTypes(text);
  if (labels[0]?.type !== "unknown" || s.labels[0]?.type === "unknown") s.labels = labels;
  const guess = guessCountry(hit.url, text, s.phones);
  s.countrySignals = [...new Set([...s.countrySignals, ...guess.signals])];
  s.country = guess.iso ?? s.country;
  const hasContact = extracted && (emails.length > 0 || allEmails.length > 0 || phones.length > 0);
  if (hasContact && !s.evidence.some((e) => e.kind === "A")) {
    s.evidence.push(makeEvidence("A", hit.url, text, { name: s.name, country: s.country, note: "company site with contact details" }));
  }
  return s;
}

export function registryEvidenceKind(cls: "registry" | "trade_data"): EvidenceKind {
  return cls === "registry" ? "B" : "D";
}

export function hostCountry(url: string): string | undefined {
  return countryFromHost(hostOf(url));
}

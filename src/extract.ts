import { countryFromHost, countryFromPhone, topCountryMention } from "./countries.js";
import { hostOf } from "./classify.js";
import type { SupplierType } from "./types.js";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_RE = /\+\d[\d\s().-]{7,17}\d/g;
const BAD_EMAIL_PARTS = ["example.", "sentry", "wixpress", "domain.com", "your@", "email@", "@2x", ".png", ".jpg", ".webp"];

export function cleanText(text: string): string {
  return text
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findEmails(text: string): string[] {
  const found = (text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase().replace(/[.,;:]+$/, ""));
  return [...new Set(found)].filter((e) => !BAD_EMAIL_PARTS.some((b) => e.includes(b)));
}

export function findPhones(text: string): string[] {
  const found = (text.match(PHONE_RE) ?? []).map((p) => p.replace(/\s+/g, " ").trim());
  return [...new Set(found)];
}

export function findMoq(text: string): string | undefined {
  const m =
    text.match(/(?:orders?\s+start\s+from|minimum\s+order(?:\s+quantity)?(?:\s+is|:)?|moq(?:\s+is|:)?)\s*([\d.,]+\s*(?:kg|kgs|tons?|tonnes?|t|mt|pcs|pieces|boxes|containers?|pallets?|fcl|l|liters?|litres?)\b[^.;\n]{0,40})/i) ??
    text.match(/(\d[\d.,]*\s*(?:kg|tons?|tonnes?|mt|pallets?|containers?|fcl)\b)\s*(?:minimum|min\.?\s*order)/i);
  return m ? cleanText(m[0]).slice(0, 90) : undefined;
}

const CERT_PATTERNS: [string, RegExp][] = [
  ["Organic", /\borganic|ecológic|ecologic|biologique|bio-zertif|\bbio\b/i],
  ["Fairtrade", /fair\s?trade/i],
  ["GlobalG.A.P.", /global\s?g\.?a\.?p\.?/i],
  ["Rainforest Alliance", /rainforest alliance/i],
  ["BRC", /\bBRC\b/],
  ["IFS", /\bIFS\b/],
  ["HACCP", /\bHACCP\b/i],
  ["ISO 22000", /ISO\s?22000/i],
  ["FSSC 22000", /FSSC\s?22000/i],
  ["Halal", /\bhalal\b/i],
  ["Kosher", /\bkosher\b/i],
  ["PDO/PGI", /\b(?:PDO|PGI|DOP|IGP)\b/],
];

export function findCertifications(text: string): string[] {
  return CERT_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

const TYPE_PATTERNS: [SupplierType, RegExp][] = [
  ["cooperative", /\bcooperative|cooperativa|co-op\b/i],
  ["farm", /\b(?:our|own)\s+(?:farm|farms|plantations?|orchards?|apiaries|groves?|fields)|\bfarm\b|hacienda|plantation|finca|apiar/i],
  ["processor", /\bprivate label|manufactur|processor|processing|mill\b|bottl|packag(?:ing|ed) (?:for|of) third|produttore|frantoio/i],
  ["exporter", /\bexport(?:er|ers|ing|s)?\b|exportador|esportator|ihracat/i],
  ["importer", /\bimport(?:er|ers|ing)?\b|importador/i],
  ["ripener", /\bripen(?:ing|er)|ripening (?:rooms?|centers?)/i],
  ["distributor", /\bdistribut(?:or|ors|ion)\b|distribuidor/i],
  ["wholesaler", /\bwholesal(?:e|er|ers)\b|mayorista|didmen|hurt\b|großhandel|grosshandel/i],
  ["trader", /\btrading\b|\btrader\b|\bbroker\b|\bsourcing agent/i],
];

export function labelTypes(text: string): { type: SupplierType; confidence: number }[] {
  const labels: { type: SupplierType; confidence: number }[] = [];
  for (const [type, re] of TYPE_PATTERNS) {
    const count = (text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`)) ?? []).length;
    if (count > 0) labels.push({ type, confidence: Math.min(0.9, 0.4 + 0.1 * count) });
  }
  return labels.length > 0 ? labels.sort((a, b) => b.confidence - a.confidence) : [{ type: "unknown", confidence: 0.2 }];
}

export interface CountryGuess {
  iso?: string;
  signals: string[];
}

/** Collects every independent country signal; callers decide whether they agree. */
export function guessCountry(url: string, text: string, phones: string[]): CountryGuess {
  const signals: string[] = [];
  const host = hostOf(url);
  const byHost = countryFromHost(host);
  if (byHost) signals.push(`tld:${byHost}`);
  const phoneIsos = phones.map(countryFromPhone).filter((x): x is string => Boolean(x));
  for (const p of new Set(phoneIsos)) signals.push(`phone:${p}`);
  const mention = topCountryMention(text);
  if (mention && mention.count >= 2) signals.push(`text:${mention.iso}`);
  const votes = new Map<string, number>();
  for (const s of signals) {
    const iso = s.split(":")[1] as string;
    votes.set(iso, (votes.get(iso) ?? 0) + (s.startsWith("phone") || s.startsWith("tld") ? 2 : 1));
  }
  const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  return { iso: top?.[0], signals };
}

const GENERIC_TITLE = /^(homepage|contacts?( us)?|miel|honey|bananas?|olive oil|our bananas|products?|one moment.*|just a moment.*|attention required.*)$/i;

export function guessName(title: string, host: string): string {
  const t = cleanText(title)
    .split(/\s[|–—-]\s|\s·\s/)[0]
    ?.trim();
  if (t && t.length >= 3 && t.length <= 70 && !/^(home|welcome|index|about)/i.test(t) && !GENERIC_TITLE.test(t)) return t;
  const base = host.split(".")[0] ?? host;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

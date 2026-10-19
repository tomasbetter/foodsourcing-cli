import type { Assessment, PageKind } from "./types.js";

type Negative = Exclude<PageKind, "supplier" | "unknown">;

/** [pattern, weight]. A page is rejected when one kind reaches weight 2 (a title match adds 1). */
const NEGATIVE: Record<Negative, [RegExp, number][]> = {
  platform: [
    [/\bmarketplace\b/i, 2],
    [/find (verified )?(suppliers|buyers|manufacturers|exporters)/i, 2],
    [/\b(b2b|trade|sourcing|ai) (platform|portal)\b/i, 2],
    [/trade (data|intelligence|statistics|metrics)|customs data|import[- ]export data|shipment (data|records)|trade databases?/i, 2],
    [/exports? by country|top \d+ (imports|exports|exporters|importers)|observatory of economic/i, 2],
    [/classifieds|post (a )?(buying|selling|sell|buy) leads?|list your (products|company|business)|онлайн каталог|объявлен/i, 2],
    [/\b[\d,]+\+? (suppliers|buyers|manufacturers|companies)\b/i, 1],
    [/\bdirectory\b|\bcompare (prices|suppliers)\b/i, 1],
  ],
  agency: [
    [/we regulate|official (website|site) of|national (agency|authority)|ministry of|government of/i, 2],
    [/we (help|support) (small|smes|sme|small and medium)|export promotion|trade promotion|development agency/i, 2],
    [/\b(association|federation|chamber of commerce|council|institute|foundation)\b/i, 1],
    [/\bour members\b|\bmembership\b/i, 1],
  ],
  news: [
    [/latest (articles|news|stories)|news briefs|breaking news/i, 1],
    [/\b(newsletter|magazine|journal|publication|editorial)\b/i, 1],
    [/\bsubscribe\b.*\b(news|updates|articles)\b/i, 1],
    [/read more about/i, 1],
  ],
  software: [
    [/(book|request|schedule) a (free )?demo/i, 2],
    [/\b(saas|erp|crm)\b|software|ai[- ]powered|ai platform|\bapi\b/i, 1],
  ],
  finance: [
    [/trade finance|project (funding|funds)|letters? of credit|\bfunding\b|financing|investors?/i, 1],
    [/commodity trading|funds? (providers?|available)/i, 1],
  ],
};

const POSITIVE: [string, RegExp][] = [
  ["quote", /(get|request|ask for|send)( us)? (a |an |your )?(free )?(quote|price list|offer|inquiry|enquiry)/i],
  ["catalog", /\b(our|the) (\w+ )?(products|product range|catalogue|catalog)\b|\bproduct range\b/i],
  ["trade-terms", /\b(wholesale|bulk|private label|fob|cif|ex-works|incoterms?)\b/i],
  ["self-description", /\b(we are|we're|is) (an? |the )?(leading |family |certified |trusted )?(exporter|producer|manufacturer|grower|farm|wholesaler|distributor|importer|packer|cooperative)|\bour (farms?|plantations?|apiar\w+|mill|orchards?|groves?|fields|factory|facility|facilities)\b|\bwe (export|produce|grow|pack|bottle|process|harvest)\b/i],
  ["quantities", /minimum order|\bmoq\b|orders start|\bpallets?\b|\bcontainers?\b|\b\d[\d.,\s]*(tons?|tonnes|mt|kg)\b/i],
  ["role", /\b(we specialis?z?e in|(exporter|manufacturer|producer|wholesaler|distributor|importer) (&|and) (supplier|exporter|manufacturer)|supplier (&|and) (exporter|manufacturer)|(is|are) (an? )?[\w\s-]{0,30}(exporter|producer|manufacturer|supplier))\b/i],
  ["certs", /global\s?g\.?a\.?p|\bbrc\b|\bifs\b|haccp|fairtrade|iso ?22000|organic certif/i],
];

export interface AssessInput {
  url: string;
  host?: string;
  title: string;
  text: string;
  productTerms: string[];
}

function negativeScore(kind: Negative, title: string, body: string): { score: number; hits: string[] } {
  let score = 0;
  const hits: string[] = [];
  for (const [re, weight] of NEGATIVE[kind]) {
    const inBody = re.test(body);
    const inTitle = re.test(title);
    if (inBody || inTitle) {
      score += weight + (inTitle ? 1 : 0);
      hits.push(re.source.slice(0, 28));
    }
  }
  return { score, hits };
}

/** Judge what kind of site a page is from its own content, not from search-result keywords. */
export function assessPage(input: AssessInput): Assessment {
  const body = input.text;
  const title = input.title;
  let worst: { kind: Negative; score: number; hits: string[] } | undefined;
  for (const kind of Object.keys(NEGATIVE) as Negative[]) {
    const { score, hits } = negativeScore(kind, title, body);
    if (!worst || score > worst.score) worst = { kind, score, hits };
  }
  const groups = POSITIVE.filter(([, re]) => re.test(body) || re.test(title)).map(([name]) => name);
  const host = (input.host ?? "").replace(/^www\./, "");
  const ownContact = host.length > 3 && new RegExp(`[\\w.+-]+@([\\w-]+\\.)*${host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(body);
  if (ownContact) groups.push("own-domain contact");
  if (worst && worst.score >= 2) {
    return { kind: worst.kind, commercialSignals: groups.length, reasons: [`looks like ${worst.kind} (${worst.hits.join(", ")})`] };
  }
  const lower = `${title} ${body}`.toLowerCase();
  const relevant = input.productTerms.some((t) => t.length > 2 && lower.includes(t.toLowerCase()));
  const strong = groups.some((g) => g === "self-description" || g === "trade-terms" || g === "quote" || g === "quantities");
  if (relevant && (groups.length >= 2 || (ownContact && strong))) {
    return { kind: "supplier", commercialSignals: groups.length, reasons: [`commercial signals: ${groups.join(", ")}`] };
  }
  const why = !relevant ? "no mention of the product" : `only ${groups.length} commercial signal(s)`;
  return { kind: "unknown", commercialSignals: groups.length, reasons: [why] };
}

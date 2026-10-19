import { countryName, isoFromName } from "./countries.js";

export interface ProductProfile {
  key: string;
  names: Record<string, string>; // language -> product name
  origins: string[]; // ISO codes of main producing countries
}

export const PROFILES: ProductProfile[] = [
  {
    key: "banana",
    names: { en: "bananas", es: "banano", pt: "banana", fr: "banane", de: "Bananen", it: "banane" },
    origins: ["EC", "CO", "CR", "GT", "PH", "DO", "PE", "CM", "CI"],
  },
  {
    key: "honey",
    names: { en: "honey", es: "miel", pl: "miód", lt: "medus", de: "Honig", ro: "miere", uk: "мед", hu: "méz" },
    origins: ["LT", "PL", "UA", "ES", "AR", "NZ", "MX", "RO", "HU", "DE"],
  },
  {
    key: "olive oil",
    names: { en: "extra virgin olive oil", es: "aceite de oliva virgen extra", it: "olio extravergine di oliva", el: "ελαιόλαδο", pt: "azeite virgem extra", tr: "zeytinyağı", fr: "huile d'olive" },
    origins: ["IT", "ES", "GR", "TR", "TN", "PT", "MA", "HR"],
  },
];

const LANG_BY_COUNTRY: Record<string, string> = {
  EC: "es", CO: "es", CR: "es", GT: "es", DO: "es", PE: "es", ES: "es", AR: "es", MX: "es",
  PH: "en", NZ: "en", CM: "fr", CI: "fr", TN: "fr", MA: "fr",
  LT: "lt", PL: "pl", UA: "uk", RO: "ro", HU: "hu", DE: "de", IT: "it", GR: "el", PT: "pt", TR: "tr", HR: "en",
};

const VAGUE_WORDS = new Set(["best", "top", "good", "cheap", "food", "foods", "fruit", "fruits", "supplier", "suppliers", "products", "stuff", "anything", "everything"]);

export class VagueInputError extends Error {
  constructor(input: string) {
    super(
      `"${input}" is too vague. Name a specific product (for example "bananas", "honey", "cashew nuts") — generic words like food, fruit or best return directories and retail noise.`,
    );
    this.name = "VagueInputError";
  }
}

export function assertSpecific(input: string): void {
  const words = input.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length === 0) throw new VagueInputError(input);
  const meaningful = words.filter((w) => !VAGUE_WORDS.has(w));
  if (meaningful.length === 0) throw new VagueInputError(input);
}

export function findProfile(product: string): ProductProfile | undefined {
  const p = product.trim().toLowerCase();
  return PROFILES.find((x) => x.key === p || Object.values(x.names).some((n) => n.toLowerCase() === p) || p.includes(x.key));
}

/** Words that show a page is about this product, across the languages we plan queries in. */
export function productTerms(product: string): string[] {
  const profile = findProfile(product);
  const terms = new Set<string>([product.trim().toLowerCase()]);
  if (profile) {
    terms.add(profile.key);
    for (const n of Object.values(profile.names)) terms.add(n.toLowerCase());
    if (profile.key === "banana") ["banan", "fruit", "fruta"].forEach((x) => terms.add(x));
    if (profile.key === "honey") ["honey", "miel", "medus", "bee products", "apicult"].forEach((x) => terms.add(x));
    if (profile.key === "olive oil") ["olive", "oliv", "aceite", "olio"].forEach((x) => terms.add(x));
  } else {
    const stem = product.trim().toLowerCase().replace(/s$/, "");
    if (stem.length > 3) terms.add(stem);
  }
  return [...terms];
}

export interface PlanOptions {
  countries?: string[]; // names or ISO codes
  languages?: string[];
  maxQueries?: number;
}

export interface QueryPlan {
  product: string;
  queries: string[];
  countries: string[];
  languages: string[];
}

export function planQueries(product: string, opts: PlanOptions = {}): QueryPlan {
  assertSpecific(product);
  const profile = findProfile(product);
  const requested = (opts.countries ?? []).map((c) => isoFromName(c) ?? c.toUpperCase()).filter((c) => countryName(c));
  const origins = requested.length > 0 ? requested : (profile?.origins ?? ["ES", "IT", "DE", "TR", "IN", "VN"]);
  const wantedLangs = opts.languages?.map((l) => l.toLowerCase());
  const queries: string[] = [];
  const langsUsed = new Set<string>(["en"]);
  const english = profile?.names.en ?? product.trim();

  for (const iso of origins) {
    const country = countryName(iso) as string;
    queries.push(`${english} exporter producer ${country} wholesale bulk contact`);
    const lang = LANG_BY_COUNTRY[iso];
    const wanted = !wantedLangs || (lang !== undefined && wantedLangs.includes(lang));
    const local = lang && lang !== "en" ? profile?.names[lang] : undefined;
    if (local && wanted) {
      queries.push(`${local} ${localB2B(lang)} ${country}`);
      langsUsed.add(lang);
    }
  }
  const variants: string[] = [];
  for (const iso of origins) {
    const country = countryName(iso) as string;
    variants.push(`${english} company ${country} our products contact us request a quote`);
    variants.push(`${english} ${country} direct from grower farm cooperative packing house`);
  }
  queries.push(`${english} private label manufacturer FOB price MOQ`);
  queries.push(`${english} importer distributor wholesale Europe`);
  queries.push(`${english} certified organic fairtrade supplier`);
  queries.push(`${english} official list of exporters registry`);

  const unique = [...new Set([...queries, ...variants])];
  return {
    product: product.trim(),
    queries: unique.slice(0, opts.maxQueries ?? 60),
    countries: origins,
    languages: [...langsUsed],
  };
}

function localB2B(lang: string): string {
  switch (lang) {
    case "es": return "productor exportador";
    case "it": return "produttore esportatore";
    case "pt": return "produtor exportador";
    case "fr": return "producteur exportateur";
    case "de": return "Produzent Großhandel";
    case "pl": return "producent hurt eksport";
    case "lt": return "gamintojas didmeninė prekyba";
    case "el": return "παραγωγός εξαγωγέας";
    case "tr": return "üretici ihracatçı";
    case "ro": return "producător angro";
    case "hu": return "termelő nagykereskedelem";
    case "uk": return "виробник оптом експорт";
    default: return "producer exporter";
  }
}

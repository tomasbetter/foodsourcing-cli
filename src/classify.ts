import type { HitClass, SearchHit } from "./types.js";

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Matches a listed domain on any TLD, e.g. "europages.com" also matches europages.co.uk.
const matches = (host: string, list: string[]): boolean =>
  list.some((d) => {
    const base = d.slice(0, d.indexOf("."));
    const labels = host.split(".");
    return host === d || host.endsWith(`.${d}`) || (base.length >= 6 && labels.includes(base));
  });

const DIRECTORY_HOSTS = [
  "tracxn.com", "tridge.com", "volza.com", "21food.com", "alibaba.com", "made-in-china.com",
  "globalsources.com", "indiamart.com", "tradekey.com", "ec21.com", "exporthub.com", "go4worldbusiness.com",
  "eworldtrade.com", "producemarketguide.com", "usetorg.com", "accio.com", "europages.com", "kompass.com",
  "yellowpages.com", "yelp.com", "crunchbase.com", "zoominfo.com", "dnb.com", "linkedin.com", "tradeindia.com",
  "importyeti.com", "scribd.com", "thomasnet.com", "exportersindia.com", "agriexpo.online",
  "tradewheel.com", "ecplaza.net", "tradeford.com", "business-standard.com", "b2brazil.com", "fruitbuyer.com",
  "dnb.com", "opencorporates.com", "bizapedia.com", "companyreg.com", "emis.com", "lusha.com", "rocketreach.co",
  "apollo.io", "cylex.com", "hotfrog.com", "pinterest.com", "tiktok.com", "wordpress.com", "blogspot.com",
  "wixsite.com", "weebly.com", "godaddysites.com", "sites.google.com", "business.site", "yumpu.com", "issuu.com",
];
const TRADE_DATA_HOSTS = ["seair.co.in", "tradeimex.in", "zauba.com", "panjiva.com", "eximpulse.com", "52wmb.com", "trademap.org"];
const MARKETPLACE_HOSTS = [
  "amazon.com", "ebay.com", "walmart.com", "webstaurantstore.com", "etsy.com", "aliexpress.com", "temu.com",
  "instacart.com", "tesco.com", "carrefour.com", "mercadolibre.com",
];
const REFERENCE_HOSTS = [
  "wikipedia.org", "wiktionary.org", "merriam-webster.com", "britannica.com", "fao.org", "usda.gov", "ams.usda.gov",
  "facebook.com", "instagram.com", "youtube.com", "twitter.com", "x.com", "reddit.com", "medium.com", "quora.com",
  "cuny.edu", "reuters.com", "bbc.com", "fruitnet.com", "freshplaza.com", "bananalink.org.uk", "scholar.google.com",
  "sciencedirect.com", "researchgate.net", "nih.gov", "europa.eu", "cirad.fr", "cgiar.org", "worldbank.org",
];
const REGISTRY_HOST_PARTS = ["agrocalidad", "gob.", "gov.", "gouv.", "gub.", "govt.", "ministerio", "ministry", "fairtrade.net", "flocert", "globalgap", "rainforest-alliance", "ccof.org", "organic-farming", "chamber"];

const NEWS_RE = /\b(news|blog|article|guide|statistics|wikipedia|report|market overview|price index)\b/i;
const LIST_URL_RE = /(exporter|supplier|directory|listado|list-of|manufacturers)/i;
const SUPPLIER_TEXT_RE = /\b(wholesale|bulk|private label|export(?:er|s)?|producer|manufacturer|our products|contact us|moq|minimum order|about us|our farm|plantation|cooperative|orders start)\b/i;

export function classifyHit(hit: Pick<SearchHit, "url" | "title" | "excerpts">): HitClass {
  const host = hostOf(hit.url);
  if (!host) return "noise";
  const path = (() => {
    try {
      return new URL(hit.url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (matches(host, TRADE_DATA_HOSTS)) return "trade_data";
  if (matches(host, DIRECTORY_HOSTS)) return "directory";
  if (matches(host, MARKETPLACE_HOSTS)) return "marketplace";
  if (REGISTRY_HOST_PARTS.some((p) => host.includes(p)) && (path.endsWith(".pdf") || LIST_URL_RE.test(path) || /exporter|registry|register|certif|listado/i.test(hit.title))) {
    return "registry";
  }
  if (matches(host, REFERENCE_HOSTS)) return "news_reference";
  const text = `${hit.title} ${hit.excerpts.join(" ")}`;
  if (!text.trim()) return "noise";
  if (/\bdefinition\b|\bmeaning\b|\bdictionary\b/i.test(hit.title)) return "noise";
  if (SUPPLIER_TEXT_RE.test(text)) return "supplier_site";
  if (NEWS_RE.test(`${hit.title} ${path}`)) return "news_reference";
  return "noise";
}

export function classifyAll(hits: SearchHit[]): { hit: SearchHit; cls: HitClass }[] {
  return hits.map((hit) => ({ hit, cls: classifyHit(hit) }));
}

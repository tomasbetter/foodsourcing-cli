import { topCountryMention } from "./countries.js";
import { companyNamesIn, hostCountry, makeEvidence, newSupplier, registryEvidenceKind, upsert, type Pool } from "./resolve.js";
import { normalizeName } from "./verify.js";
import type { HitClass, SearchHit } from "./types.js";

export function squash(value: string): string {
  return normalizeName(value).replace(/\s+/g, "");
}

const GENERIC_NAMES = new Set(["banana", "bananas", "honey", "oliveoil", "oliveoils", "fruit", "fruits", "contact", "home", "products", "export", "exporter", "company", "organic"]);

/** Names made only of product words ("Bananas") would match any page, so they never confirm. */
export function isDistinctiveName(name: string): boolean {
  const s = squash(name);
  if (s.length < 8 || GENERIC_NAMES.has(s)) return false;
  return normalizeName(name).split(" ").some((t) => t.length > 3 && !GENERIC_NAMES.has(t));
}

/**
 * Turn registry and trade-data hits into evidence: confirm known suppliers whose names appear
 * in the source, and add every other listed company as a single-proof lead.
 */
export function harvestRegistries(pool: Pool, classified: { hit: SearchHit; cls: HitClass }[], product: string): void {
  const sources = classified.filter((c) => c.cls === "registry" || c.cls === "trade_data");
  const first = normalizeName(product).split(" ")[0] ?? "";
  const relevant = new RegExp(`${first}|banan|fruit|honey|miel|oil|aceite|olio`, "i");
  for (const { hit, cls } of sources) {
    const kind = registryEvidenceKind(cls as "registry" | "trade_data");
    const text = hit.excerpts.join("\n");
    const country = hostCountry(hit.url) ?? topCountryMention(text)?.iso;
    const squashedText = squash(text);
    for (const s of pool.byKey.values()) {
      const base = s.domain ? squash(s.domain.split(".")[0] as string) : "";
      const hasName = isDistinctiveName(s.name) && squashedText.includes(squash(s.name));
      const hasDomain = base.length >= 6 && !GENERIC_NAMES.has(base) && squashedText.includes(base);
      if ((hasName || hasDomain) && !s.evidence.some((e) => e.url === hit.url)) {
        s.evidence.push(makeEvidence(kind, hit.url, hit.title, { name: s.name, country: country ?? s.country, note: `listed in ${cls}` }));
      }
    }
    if (!relevant.test(text) && !relevant.test(hit.title)) continue;
    for (const name of companyNamesIn(text).slice(0, 60)) {
      const candidate = newSupplier(name);
      candidate.country = country;
      candidate.evidence.push(makeEvidence(kind, hit.url, name, { name, country, note: `listed in ${cls}` }));
      upsert(pool, candidate);
    }
  }
  mergeByName(pool);
}

/** Registry/trade-data records without a website merge into a same-named site record. */
export function mergeByName(pool: Pool): void {
  const withSite = [...pool.byKey.values()].filter((s) => s.domain);
  for (const [key, s] of [...pool.byKey.entries()]) {
    if (s.domain) continue;
    const mine = squash(s.name);
    const target = withSite.find((w) => {
      const theirs = squash(w.name);
      return theirs === mine || (theirs.length >= 8 && mine.includes(theirs));
    });
    if (target) {
      target.evidence.push(...s.evidence);
      pool.byKey.delete(key);
    }
  }
}

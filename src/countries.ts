import { COUNTRIES } from "./country-data.js";

export { COUNTRIES } from "./country-data.js";
export type { Country } from "./country-data.js";

const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]));
const BY_TLD = new Map(COUNTRIES.map((c) => [c.tld, c]));
const PHONE_PREFIXES = [...COUNTRIES].sort((a, b) => b.phone.length - a.phone.length);
const GENERIC_TLDS = new Set(["com", "net", "org", "info", "biz", "eu", "io", "app", "shop", "store", "online", "site", "xyz"]);

export function countryName(iso: string | undefined): string | undefined {
  return iso ? BY_ISO.get(iso)?.name : undefined;
}

export function isoFromName(value: string): string | undefined {
  const v = value.trim().toLowerCase();
  for (const c of COUNTRIES) {
    if (c.iso.toLowerCase() === v || c.name.toLowerCase() === v) return c.iso;
    if (c.aliases.some((a) => a.toLowerCase() === v)) return c.iso;
  }
  return undefined;
}

/** Country implied by a host's top-level domain, e.g. agrocalidad.gob.ec -> EC. */
export function countryFromHost(host: string): string | undefined {
  const parts = host.toLowerCase().split(".");
  const tld = parts[parts.length - 1] ?? "";
  if (GENERIC_TLDS.has(tld)) return undefined;
  return BY_TLD.get(tld)?.iso;
}

/** Country implied by an international phone number such as +34 629 85 99 19. */
export function countryFromPhone(phone: string): string | undefined {
  if (!phone.trim().startsWith("+")) return undefined;
  const digits = phone.replace(/[^\d]/g, "");
  for (const c of PHONE_PREFIXES) {
    if (digits.startsWith(c.phone)) return c.iso;
  }
  return undefined;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Most frequently mentioned country in text, with its mention count. */
export function topCountryMention(text: string): { iso: string; count: number } | undefined {
  let best: { iso: string; count: number } | undefined;
  for (const c of COUNTRIES) {
    const names = [c.name, ...c.aliases].filter((n) => n.length > 3 || n === "UK" || n === "USA");
    let count = 0;
    for (const n of names) {
      const re = new RegExp(`(?<![\\p{L}])${escapeRegex(n)}(?![\\p{L}])`, "giu");
      count += (text.match(re) ?? []).length;
    }
    if (count > 0 && (!best || count > best.count)) best = { iso: c.iso, count };
  }
  return best;
}

import { hostOf } from "./classify.js";
import { assessPage } from "./quality.js";
import { applyOwnSite, type Pool } from "./resolve.js";
import type { Assessment, ExtractResult, Supplier } from "./types.js";

const NEGATIVE = new Set(["platform", "agency", "news", "software", "finance"]);

export function isNegative(a: Assessment | undefined): boolean {
  return a !== undefined && NEGATIVE.has(a.kind);
}

/** Conservative merge: any page that looks like a non-supplier wins; a supplier page beats unknown. */
export function mergeAssessment(prev: Assessment | undefined, next: Assessment): Assessment {
  if (prev && isNegative(prev)) return prev;
  if (isNegative(next)) return next;
  if (prev?.kind === "supplier") return prev;
  if (next.kind === "supplier") return next;
  return prev ?? next;
}

/** A qualified supplier is a company site (judged by its own content) with a contact we can use. */
export function isQualified(s: Supplier): boolean {
  return s.assessment?.kind === "supplier" && (s.emails.length > 0 || s.phones.length > 0);
}

export function isRejected(s: Supplier): boolean {
  return isNegative(s.assessment);
}

/** Markdown links keep their visible text so words like "Request a quote" still count. */
export function plainText(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Record an extracted page: contacts and evidence, plus a content-based quality judgement. */
export function ingestPage(pool: Pool, page: ExtractResult, productTerms: string[]): Supplier | undefined {
  const s = applyOwnSite(pool, page, true);
  if (!s) return undefined;
  const text = plainText(page.excerpts.join(" "));
  if (!s.enrichment) {
    const assessment = assessPage({ url: page.url, host: hostOf(page.url), title: page.title, text, productTerms });
    s.assessment = mergeAssessment(s.assessment, assessment);
  }
  if (!s.snippet) s.snippet = text.slice(0, 280);
  s.qualified = isQualified(s);
  return s;
}

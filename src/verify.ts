import { PROOF_KINDS, type Evidence, type EvidenceKind, type Supplier, type SupplierStatus } from "./types.js";
import { hostOf } from "./classify.js";

export interface VerifyOptions {
  now?: Date;
  staleAfterDays?: number;
}

const SUFFIXES = /\b(s\.?a\.?s?|s\.?l\.?|ltd\.?|limited|llc|inc\.?|gmbh|s\.?r\.?l\.?|uab|sia|sp\.? z o\.?o\.?|b\.?v\.?|co\.?|company|cia|ltda|c\.?a\.?)\b/g;

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function namesAgree(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const tx = new Set(x.split(" ").filter((t) => t.length > 2));
  const ty = new Set(y.split(" ").filter((t) => t.length > 2));
  if (tx.size === 0 || ty.size === 0) return false;
  const shared = [...tx].filter((t) => ty.has(t)).length;
  return shared / Math.min(tx.size, ty.size) >= 0.6;
}

/** Independent = different kind and different host (copies of one source never count twice). */
export function independentProofs(evidence: Evidence[]): Evidence[] {
  const proofs = evidence.filter((e) => PROOF_KINDS.includes(e.kind));
  const chosen: Evidence[] = [];
  const kinds = new Set<EvidenceKind>();
  const hosts = new Set<string>();
  for (const e of proofs) {
    const host = hostOf(e.url);
    if (kinds.has(e.kind) || hosts.has(host)) continue;
    kinds.add(e.kind);
    hosts.add(host);
    chosen.push(e);
  }
  return chosen;
}

export interface Verdict {
  status: SupplierStatus;
  confidence: number;
  reasons: string[];
}

const REJECT_KINDS = ["platform", "agency", "news", "software", "finance"];

export function evaluate(supplier: Supplier, opts: VerifyOptions = {}): Verdict {
  const kind = supplier.assessment?.kind;
  if (kind && REJECT_KINDS.includes(kind)) {
    return { status: "rejected", confidence: 0.05, reasons: [`page content looks like a ${kind}, not a supplier`] };
  }
  const now = opts.now ?? new Date();
  const staleMs = (opts.staleAfterDays ?? 365) * 86_400_000;
  const reasons: string[] = [];
  const last = Date.parse(supplier.lastVerified);
  const stale = Number.isFinite(last) && now.getTime() - last > staleMs;

  const proofs = independentProofs(supplier.evidence);
  const proofCountries = new Set(proofs.map((p) => p.country).filter((c): c is string => Boolean(c)));
  const countryConflict = proofCountries.size > 1;
  const nameConflicts = proofs.some((p) => p.name && !namesAgree(p.name, supplier.name) && !namesAgree(p.name, proofs[0]?.name));

  if (countryConflict) reasons.push(`sources disagree on country: ${[...proofCountries].join(", ")}`);
  if (nameConflicts) reasons.push("sources disagree on company name");
  if (supplier.countrySignals.length > 0) {
    const isos = new Set(supplier.countrySignals.map((s) => s.split(":")[1]));
    if (isos.size > 1 && !supplier.country) reasons.push(`conflicting country signals: ${supplier.countrySignals.join(", ")}`);
    else if (isos.size > 1) reasons.push(`mixed country signals (${supplier.countrySignals.join(", ")}); using ${supplier.country}`);
  }

  if (countryConflict || nameConflicts) return { status: "needs_review", confidence: 0.3, reasons };
  if (stale) return { status: "stale", confidence: 0.4, reasons: [...reasons, "last verification is older than the allowed age"] };

  const hasTrader = supplier.labels.some((l) => l.type === "trader");
  if (hasTrader) reasons.push("labeled trader/broker: may add a margin, confirm if you need the producer");

  if (proofs.length >= 2) {
    reasons.push(`verified by ${proofs.map((p) => p.kind).join(" + ")}`);
    return { status: "verified", confidence: Math.min(0.95, 0.7 + 0.1 * (proofs.length - 2) + (supplier.emails.length > 0 ? 0.05 : 0)), reasons };
  }
  if (proofs.length === 1) {
    reasons.push(`only one independent proof (${proofs[0]?.kind}); need a second`);
    return { status: "corroborated", confidence: 0.5, reasons };
  }
  reasons.push("no independent proof yet (directory or search hit only)");
  return { status: "lead", confidence: 0.2, reasons };
}

export function applyVerdict(supplier: Supplier, opts: VerifyOptions = {}): Supplier {
  const v = evaluate(supplier, opts);
  const notes = supplier.notes.filter((n) => !n.startsWith("verify: "));
  return { ...supplier, status: v.status, confidence: v.confidence, notes: [...notes, ...v.reasons.map((r) => `verify: ${r}`)] };
}

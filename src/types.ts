export type EvidenceKind = "A" | "B" | "C" | "D" | "E";
// A = company-owned site, B = official registry, C = certification body,
// D = trade/shipment data, E = directory listing (lead only, never a proof).

export const PROOF_KINDS: EvidenceKind[] = ["A", "B", "C", "D"];

export type SupplierStatus =
  | "lead"
  | "corroborated"
  | "verified"
  | "needs_review"
  | "stale"
  | "rejected";

export type SupplierType =
  | "farm"
  | "cooperative"
  | "processor"
  | "exporter"
  | "importer"
  | "distributor"
  | "wholesaler"
  | "ripener"
  | "trader"
  | "unknown";

export type HitClass =
  | "supplier_site"
  | "registry"
  | "trade_data"
  | "directory"
  | "marketplace"
  | "news_reference"
  | "noise";

export interface SearchHit {
  url: string;
  title: string;
  excerpts: string[];
  query?: string;
}

export interface ExtractResult {
  url: string;
  title: string;
  excerpts: string[];
}

export interface Evidence {
  kind: EvidenceKind;
  url: string;
  retrievedAt: string;
  excerpt: string;
  name?: string;
  country?: string;
  note?: string;
}

export interface LabelScore {
  type: SupplierType;
  confidence: number;
}

export type PageKind = "supplier" | "platform" | "agency" | "news" | "software" | "finance" | "unknown";

export interface Assessment {
  kind: PageKind;
  commercialSignals: number;
  reasons: string[];
}

export type Confidence = "low" | "medium" | "high";

/** Structured judgement of one company website from the Parallel Task API, with its sources. */
export interface Enrichment {
  companyName: string;
  organizationType: string;
  sellsToBusinesses: "yes" | "no" | "unclear";
  sellsProduct: "yes" | "no" | "unclear";
  mainProducts: string;
  country: string;
  contactEmail: string;
  moq: string;
  certifications: string;
  confidence: Confidence;
  citations: string[];
  processor: string;
}

export interface EnrichResult {
  url: string;
  enrichment?: Enrichment;
  error?: string;
}

export interface EnrichOptions {
  processor: string;
  product: string;
}

export interface Supplier {
  id: string;
  name: string;
  website?: string;
  domain?: string;
  country?: string;
  countrySignals: string[];
  labels: LabelScore[];
  emails: string[];
  phones: string[];
  moq?: string;
  certifications: string[];
  evidence: Evidence[];
  status: SupplierStatus;
  confidence: number;
  notes: string[];
  assessment?: Assessment;
  enrichment?: Enrichment;
  snippet?: string;
  qualified?: boolean;
  lastVerified: string;
}

export interface CallRecord {
  tool: "search" | "extract" | "enrich";
  items: number;
  ok: boolean;
  cached: boolean;
  ms: number;
  error?: string;
}

export interface RoundInfo {
  round: number;
  queries: number;
  newHits: number;
  extracted: number;
  qualified: number;
}

export interface RunInfo {
  product: string;
  provider: string;
  startedAt: string;
  finishedAt: string;
  budget: number;
  callsUsed: number;
  cacheHits: number;
  failures: number;
  queries: string[];
  hits: number;
  hitClasses: Record<string, number>;
  calls: CallRecord[];
  target?: number;
  qualified?: number;
  rounds?: RoundInfo[];
  enriched?: number;
  enrichCalls?: number;
}

export interface DiscoveryFile {
  product: string;
  generatedAt: string;
  suppliers: Supplier[];
  run: RunInfo;
}

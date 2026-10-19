import type { Confidence, Enrichment } from "./types.js";

const text = (description: string) => ({ type: "string", description });

export const ORG_TYPES = [
  "farm_or_grower", "processor_or_packer", "exporter", "importer", "wholesaler_or_distributor", "trader_or_broker",
  "marketplace_or_directory", "trade_data_platform", "government_agency_or_association", "news_or_media",
  "software_or_service", "other",
] as const;

/** Task spec asking for a cited, structured judgement of one company website. */
export function buildTaskSpec(product: string): Record<string, unknown> {
  return {
    output_schema: {
      type: "json",
      json_schema: {
        type: "object",
        properties: {
          company_name: text("Legal or trading name of the company that owns the website"),
          organization_type: text(
            "Exactly one of: farm_or_grower (grows its own produce), processor_or_packer (processes, packs or manufactures, incl. private label), exporter, importer, wholesaler_or_distributor (buys from others and resells to businesses), trader_or_broker (intermediary with no own production or stock), marketplace_or_directory, trade_data_platform, government_agency_or_association (incl. industry associations and export-promotion bodies), news_or_media, software_or_service, other",
          ),
          sells_food_to_businesses: text("yes, no or unclear: does this organization itself sell food products to business buyers (not just list other companies)"),
          sells_requested_product: text(`yes, no or unclear: does this organization itself sell ${product}`),
          main_products: text("Main food products it sells, or empty string"),
          country: text("Country where the company is based, in English"),
          contact_email: text("A business contact email found on the official website, or empty string"),
          minimum_order_quantity: text("Minimum order quantity if stated, or empty string"),
          certifications: text("Food-safety or organic certifications stated, comma separated, or empty string"),
        },
        required: [
          "company_name", "organization_type", "sells_food_to_businesses", "sells_requested_product", "main_products",
          "country", "contact_email", "minimum_order_quantity", "certifications",
        ],
        additionalProperties: false,
      },
    },
  };
}

export function taskInput(url: string, product: string): string {
  return `Company website: ${url}\nWe are looking for suppliers of: ${product}`;
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const asConfidence = (v: unknown): Confidence => (v === "high" || v === "medium" || v === "low" ? v : "medium");
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const yesNo = (v: unknown): "yes" | "no" | "unclear" => {
  const s = str(v).toLowerCase();
  return s === "yes" || s === "no" ? s : "unclear";
};

interface Basis {
  field?: string;
  confidence?: string;
  citations?: { url?: string }[];
}

/** Read a Task API result (direct API or Composio shape). Returns undefined if it has no usable content. */
export function parseTaskResult(raw: unknown, processor: string): Enrichment | undefined {
  const root = (raw as { data?: unknown } | null)?.data ?? raw;
  const out = (root as { output?: unknown } | null)?.output as { content?: Record<string, unknown>; basis?: Basis[] } | undefined;
  const c = out?.content;
  if (!c || typeof c !== "object" || !str(c.organization_type)) return undefined;
  const basis = Array.isArray(out?.basis) ? (out?.basis as Basis[]) : [];
  const key = basis.filter((b) => b.field === "organization_type" || b.field === "sells_food_to_businesses");
  const conf = key.length > 0 ? key.map((b) => asConfidence(b.confidence)).reduce((a, b) => (RANK[a] <= RANK[b] ? a : b)) : "medium";
  const citations = [...new Set(key.flatMap((b) => (b.citations ?? []).map((x) => x.url ?? "").filter(Boolean)))].slice(0, 6);
  return {
    companyName: str(c.company_name),
    organizationType: str(c.organization_type).toLowerCase(),
    sellsToBusinesses: yesNo(c.sells_food_to_businesses),
    sellsProduct: yesNo(c.sells_requested_product),
    mainProducts: str(c.main_products),
    country: str(c.country),
    contactEmail: str(c.contact_email),
    moq: str(c.minimum_order_quantity),
    certifications: str(c.certifications),
    confidence: conf,
    citations,
    processor,
  };
}

# foodsourcing-cli

Open-source CLI that discovers, classifies and verifies food suppliers worldwide using web search.
Status: **v0.1.0 pilot**. Results need human review before you rely on them.

## How it works
1. **Plan**: turns a product ("bananas") into targeted B2B queries across origin countries and languages. Vague input ("best fruit suppliers") is rejected.
2. **Search and classify**: each hit is labeled supplier site, registry, trade data, directory, marketplace, reference or noise. Only supplier sites and registries move on.
3. **Extract**: reads supplier sites for emails, phones, MOQ, certifications and a supplier type label (farm, exporter, trader and so on).
4. **Resolve**: registry and trade-data companies have no website, so each is searched by name and linked to its own site only if the name matches.
5. **Verify**: a supplier is `verified` only with **two independent, agreeing proofs** (company site, official registry, certification body, trade data). Directory listings are leads, never proof. Conflicts go to `needs_review`.

Status ladder: `lead` → `corroborated` (one proof) → `verified` (two proofs); also `needs_review` and `stale`.
"Verified" means two sources agree. It does not mean the supplier is endorsed.

## Quick start
```bash
npm install
cp .env.example .env        # add PARALLEL_API_KEY (https://platform.parallel.ai)
npx tsx src/cli.ts doctor
npx tsx src/cli.ts discover bananas --out ./out --budget 66
npx tsx src/cli.ts report ./out
```
Build a binary with `npm run build`; the command is `foodsourcing`.

## Commands
| Command | Purpose |
|---|---|
| `init` | create a `.env` template |
| `doctor` | check provider config and connectivity |
| `discover <product>` | `--out`, `--countries`, `--languages`, `--budget`, `--target <n>`, `--max-rounds <n>`, `--concurrency <n>`, `--enrich-concurrency <n>`, `--no-enrich`, `--enrich-processor <lite\|base\|core>`, `--max-enrich <n>`, `--no-cache` |
| `verify <file>` | re-apply the verification rule |
| `review <file>` | list conflicts, stale records and traders |
| `export <file>` | `--format csv\|json`, `--status verified,corroborated` |
| `report <path>` | pilot metrics for one file or a folder |

## Quality loop (`--target`)
`discover bananas --target 10` searches in rounds of 6 queries. After each round it reads the new supplier sites and judges each page by its own content: marketplaces, trade-data platforms, agencies, news, software and trade-finance pages are `rejected`; a company page that mentions the product, shows trade signals (quote link, bulk/FOB terms, quantities, self-description) and has a contact is `qualified`. The loop stops when the target number of qualified suppliers is reached, queries run out, or the call budget is used. `qualified` is a content check, separate from `verified` (two independent proofs).

Measured on 2026-10-19 (hand-audit notes are kept out of this repo): before the gate 6 of 19 sampled records were real suppliers (32%); after it 10 of 10 sampled qualified records were real (n=10, judged by the author, small sample).

## Parallel calls
Searches and page extractions run in parallel (`--concurrency`, default 10, max 50). Task runs run one per site, in parallel (`--enrich-concurrency`, default 20, max 50), so one slow site does not hold back the others. Parallel's documented default limits are 600 requests per minute for Search and Extract and 2,000 per minute for Task runs; check them before raising the numbers.

## Task API judging (on by default)
After each round, candidate sites are judged by the Parallel Task API: a structured, cited verdict on organization type (farm, exporter, wholesaler, marketplace, trade-data platform, agency, news and so on), whether it sells to businesses, country, contact email, MOQ and certifications. Marketplaces, agencies, news and software sites are rejected. It costs about $0.005 (`lite`), $0.01 (`base`) or $0.025 (`core`) per site at Parallel's list price, capped by `--max-enrich` (default 40). `--no-enrich` falls back to the page-content checks above.

Status: tested on 10 known sites (10 of 10 matched my own earlier verdicts) and one live banana run. In that run a client-side timeout threw away 25 finished Task results; the results were recovered by run ID and the timeout was raised, but a clean end-to-end re-run and a fresh audit have not been done yet. Task labels and countries are not independently verified.

## Providers
- **parallel** (default when `PARALLEL_API_KEY` is set): calls the Parallel Search and Extract APIs directly.
- **composio** (optional): reuses a logged-in `composio` CLI with a linked `parallel` toolkit account. No key is read or stored here.
Set `FOODSOURCING_PROVIDER` to force one. Each run is capped by `--budget` (default 200 calls) and responses are cached under `<out>/.cache`.

## Output
`<product>.json` (full records and run log), `<product>.csv` (review sheet), `<product>.evidence.json` (every proof with its source URL).

## Tests
`npm test` runs offline; no network or keys needed.

## Responsible use
Respect each site's terms and robots.txt, rate limits, and data-protection law (for example GDPR) when contacting suppliers. Supplier contacts are business data; do not commit them. This is guidance, not legal advice. Provider terms (Parallel, Composio) apply to whoever runs the CLI.

## Contributing and security
See [CONTRIBUTING.md](CONTRIBUTING.md) to get started, [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community rules, and [SECURITY.md](SECURITY.md) to report a vulnerability privately. CI runs typecheck, tests and build on Node 20, 22 and 24, plus a check that no `.env`, discovery output or API key is committed.

## License
Apache-2.0

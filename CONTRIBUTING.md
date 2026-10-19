# Contributing to foodsourcing-cli

Thanks for helping. This project finds and checks food suppliers from the open web, so the most useful contributions are the ones that make results more accurate, more transparent or cheaper to produce.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Security problems go through the [Security Policy](SECURITY.md), not public issues.

## Set up

Requires Node.js 20 or newer.

```bash
git clone https://github.com/tomasbetter/foodsourcing-cli.git
cd foodsourcing-cli
npm ci
npm run typecheck
npm test
npm run build
```

Tests run offline. They need no network and no API keys, and a pull request must not add a test that does.

To try the CLI against the real web you need your own provider access (see the README). Live runs cost money on your account; start with a small `--budget` and `--max-enrich`.

## Making a change

1. Open an issue first for anything bigger than a small fix, so we can agree on the approach.
2. Create a branch from `main`.
3. Keep the change focused. One concern per pull request.
4. Add or update tests for behavior you change. Prefer small fixtures over recorded live responses.
5. Run `npm run typecheck && npm test && npm run build` before pushing. CI runs the same on Node 20, 22 and 24.
6. Update the README when you change a command, flag or behavior.

The code is TypeScript with ES modules. Follow the style of the surrounding files; there is no formatter configured yet.

## Rules that protect users

- **Never commit secrets or supplier data.** No API keys, no `.env`, no discovery output (`out*/`), no real supplier emails or phone numbers. Tests and examples use fake addresses on reserved names such as `example.test`. CI blocks tracked `.env` files, tracked `out*/` folders and key-like strings.
- **Do not weaken the verification rule quietly.** A supplier is `verified` only with two independent, agreeing proofs. Directory listings are leads, not proof. If you want to change this, say so in the pull request and explain why.
- **Do not claim accuracy you have not measured.** If you change classification or enrichment, report how you checked it: sample size, who judged, and what was not tested.
- **Keep costs visible.** New calls to paid APIs need a cap or budget option and a mention in the README.

## Good first contributions

- Registry connectors for more countries (official exporter lists are the strongest evidence we have)
- Product profiles: names in more languages, main producing countries
- More directory, marketplace and trade-data domains for the classifier
- Better country, supplier-type and MOQ detection, with tests
- A provider for another search or extraction service behind the existing `Provider` interface

## Reporting bugs and bad results

Open an issue with the command you ran, the product, the provider and the Node version. For a wrong result, say what the supplier actually is and link to the page that shows it. Do not paste API keys, and remove supplier contact details from logs.

## License

Contributions are licensed under the project's [Apache-2.0 license](LICENSE).

# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. If that option is not available, open a public issue that says only "I have a security report" and no details, and the maintainer ([@tomasbetter](https://github.com/tomasbetter)) will arrange a private channel.

This is a small project run by one maintainer. There is no fixed response time. Reports will be read and answered as soon as practical, and a fix will be released and credited if you wish.

## Supported versions

Only the latest release on `main` is supported. The project is at version 0.x, so behavior may change between releases.

## What counts

In scope:
- Leaking or logging API keys (for example `PARALLEL_API_KEY`) or other credentials
- Writing supplier contact data or other output outside the chosen output directory
- Command or argument injection through product names, URLs or provider output
- Unsafe handling of the optional Composio provider's local `composio` command

Out of scope:
- Wrong, outdated or misleading supplier data. Results come from the open web and are not guaranteed; report data problems as normal issues.
- Vulnerabilities in Parallel, Composio, Node.js or other third-party services. Report those to their owners.
- Costs from API usage. You run the tool with your own keys; use `--budget` and `--max-enrich` to cap spend.

## Keeping your own keys safe

- Keep keys in environment variables or an untracked `.env` file. Never commit `.env`.
- Treat discovery output as private: it contains supplier emails and phone numbers. The default `out*/` folders are git-ignored; keep them that way.
- If a key was ever pasted into a chat, ticket or log, rotate it.

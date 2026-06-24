# Security Policy

ME3 Core is an owner-controlled installable runtime. Security reports matter
because a Core install can hold personal data, site content, mailbox data,
calendar data, provider tokens, and local automation permissions.

## Supported Versions

Security fixes are prepared against the latest `main` and the latest stable
Core release metadata in `updates/stable.json`. Older tags are best-effort only.

Installers should update to the latest stable Core release before opening an
install to a wider audience.

## Reporting a Vulnerability

Report suspected vulnerabilities privately. Use GitHub private vulnerability
reporting for this repository when available. If you received ME3 Core directly
from an installer, contact that installer privately.

Please include:

- the affected Core version, commit, or release tag;
- the affected route, feature, plugin, or setup step;
- whether real secrets, owner data, mailbox data, payments, or public site data
  may be exposed;
- reproduction steps using placeholder data where possible.

Do not open a public issue with exploit details, real secrets, `.dev.vars`,
Cloudflare account IDs, API keys, session cookies, provider tokens, or private
owner data.

Expected response: acknowledgment within 72 hours, then a fix or mitigation plan
once the issue is reproduced and scoped.

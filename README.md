# me3

Installable ME3 Core personal/business AI assistant scaffold.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Soulink-Foundation/me3)

Fastest path: use the deploy button, sign in to Cloudflare, let Cloudflare fork the repo and provision the Worker bindings, then enter the prompted install secrets. For local development or a manual CLI deploy, use the flows below.

This repository is intentionally small at first. It is not a raw split of `me3-app`; it is the curated first slice that will become a bootable Cloudflare install template.

## First Slice

- Cloudflare Worker shell with health, admin bootstrap, assistant chat placeholder, and public profile/me.json endpoints.
- Vue web shell for local admin/bootstrap and setup-required states.
- Minimal D1 schema for install metadata, owner profile, and assistant messages.
- Example install config with no ME3 Cloud production domains, IDs, routes, or secrets.
- Simple provider-free owner auth: bootstrap code claims the install, password login opens the workspace, and httpOnly signed session cookies keep the owner signed in.

## Boundaries

ME3 Core owns the installable assistant runtime, owner profile, me.json output, setup-required integration states, and optional owner-supplied providers.

ME3 Cloud hosted-only config is excluded: production `me3.app` routes, production Cloudflare IDs/tokens, hosted subscription billing, support ops, and managed customer infrastructure.

Plugin-owned config is excluded from the boot slice until plugin packages are installed.

## Local Shape

```bash
pnpm install
pnpm setup:dev-vars
pnpm --filter @me3-core/worker db:migrate:local
pnpm verify:local-boot
pnpm build
pnpm --filter @me3-core/worker dev
pnpm --filter @me3/web dev
```

`pnpm setup:dev-vars` creates `apps/worker/.dev.vars` with generated local-only bootstrap values. Never commit real secrets.

`pnpm verify:local-boot` is the extraction acceptance gate for the first slice. It applies the local D1 migration, starts the Worker and web shell, checks `/health`, `/api/config`, `/api/admin/bootstrap`, `/api/assistant/chat`, `/.well-known/me.json`, and verifies that the web shell responds.

## Owner Auth

ME3 Core uses a local-first owner bootstrap flow so an install can come up without Postmark, OAuth, hosted billing, or ME3 Cloud.

Required owner auth secrets:

- `ADMIN_BOOTSTRAP_CODE` unlocks first-run setup and owner credential recovery.
- `JWT_SECRET` signs the owner session cookie.

ME3 Core creates its install encryption key automatically during owner setup when
`TOKEN_ENCRYPTION_KEY` is not provided. Operators may still set
`TOKEN_ENCRYPTION_KEY` as an external secret if they want to manage that key
outside D1.

Local setup:

```bash
pnpm setup:dev-vars
pnpm --filter @me3-core/worker db:migrate:local
pnpm --filter @me3-core/worker dev
pnpm --filter @me3/web dev
```

Open the web app, enter the generated `ADMIN_BOOTSTRAP_CODE`, and create the owner profile with an email and password. A successful bootstrap stores a password hash in D1 and sets an httpOnly `me3_core_session` cookie. Returning owners sign in with email and password through `/api/auth/login`; the bootstrap code is kept for install-claim and recovery, not everyday login.

The web app reads `/api/config` to decide whether owner password auth is configured, hydrates refreshes from `/api/auth/me`, and logs out through `/api/auth/logout`; it does not trust localStorage for authentication.

Owner-only Worker routes, including `/api/assistant/chat`, require a valid server-verified session. Public install routes such as `/health`, `/api/config`, and `/.well-known/me.json` remain unauthenticated.

## Mailbox Sender Providers

ME3 Core treats outbound email as a provider adapter system. Core owns mailbox UI, message/thread storage, drafts, send audit, agent approvals, and reply workflow. Provider adapters only handle delivery and inbound transport. Provider tokens are encrypted at rest with the install encryption key and are never returned to the browser or written to `me.json`. Core creates that install key automatically during owner setup when `TOKEN_ENCRYPTION_KEY` is not supplied as an operator-managed override.

The account-level sender settings live in Account -> Mailbox settings:

- Recommended: Cloudflare Email Service
- Bring another sender: Postmark, Mailgun, SMTP
- Future provider slots: SES, Resend, SendGrid

Cloudflare Email Service is the first/default adapter. Required setup is Workers Paid, a sending domain on Cloudflare DNS, a verified sending address or domain, and either a `send_email` binding named `EMAIL` or REST API account ID/token configured through the owner UI. Its fields are from address, display name, optional reply-to, sending domain, transport (`binding` or `rest`), Cloudflare account ID for REST, and API token for REST.

Postmark is the first stable external adapter. Its fields are server API token, confirmed sender signature or verified sender domain, from address, display name, optional reply-to, and message stream (default `outbound`). Mailgun and SMTP are visible as next sender paths, but their adapter implementations are deferred.

The provider interface normalizes setup requirements, readiness state, test sends, and delivery results. Sent-message audit belongs in `email_send_audit`: provider ID, provider message ID/status, from/to/subject, `thread_key`, `Message-ID`/`In-Reply-To`/`References`, approval/source metadata, failures, and timestamps. `mailbox_messages` keeps provider IDs for threading joins without making any provider the mailbox system of record.

Deferred inbound mailbox work includes Cloudflare Email Service Worker email handlers, Cloudflare routing rules and addresses, Postmark/Mailgun inbound webhook verification, MIME attachment persistence, thread-key derivation from `Message-ID`/`In-Reply-To`/`References`, and mailbox source management for custom domains and external forwards.

## Web UI

The Core OSS web app is copied from `me3-app` rather than redesigned from scratch. Calendar, email, sites, and settings use the existing ME3 Vue/Vite UI as the base. `/assistant` is intentionally a placeholder for now, with the existing side navigation entry pointing at it.

## Install Config

`apps/worker/wrangler.core.example.toml` is the first install-template config. It includes only Core bindings and local defaults:

- `DB` D1 binding for Core tables
- `ME3_USER_AGENT` Durable Object binding
- optional `AI` Workers AI binding
- public origin/model vars for local boot

It intentionally excludes production `me3.app` routes, production Cloudflare account/zone IDs, plugin queues, hosted subscription billing config, and real provider secrets.

`apps/worker/.dev.vars.example` lists secret names only. The first generated local values are:

- `JWT_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `ADMIN_BOOTSTRAP_CODE`

Owner-supplied providers such as OpenAI, Anthropic, outbound email senders, Stripe, OAuth, and search remain blank until an install owner configures them.

## Cloudflare Deploy

The root `wrangler.toml` is the deploy-template config for the Deploy to Cloudflare button, Cloudflare Workers Builds, and manual Wrangler deploys. It defines:

- Worker entrypoint: `apps/worker/src/index.ts`
- Static web assets: `apps/web/dist`
- SPA fallback for copied Vue routes
- Worker-first routing for all paths, so one Worker can route by hostname
- D1 binding and migration directory
- `SITE_ASSETS` R2 binding for Core file storage
- `ME3_USER_AGENT` Durable Object namespace
- optional Workers AI binding
- public origin/model defaults
- root `.dev.vars.example` secret prompts for button-based deploys

Cloudflare should provision supported resources from the Wrangler config during button/template deployment. Required and optional install secrets are described in `package.json`; root `.dev.vars.example` lists the secrets that the deploy button should prompt for.

### Deploy Button

Use the button at the top of this README when you want Cloudflare to handle the GitHub fork, Worker build, and supported resource provisioning.

Required install secrets:

- `JWT_SECRET`: random session signing secret
- `ADMIN_BOOTSTRAP_CODE`: one-time owner setup code

Optional install secrets:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

`TOKEN_ENCRYPTION_KEY` is intentionally optional. If it is omitted, ME3 Core creates a persistent install encryption key in D1 during owner setup.

After the first deploy, open the admin URL, enter `ADMIN_BOOTSTRAP_CODE`, and create the owner account.

### Manual CLI Deploy

Use this when testing from a local checkout with your own Cloudflare account:

```bash
pnpm install
pnpm exec wrangler login
pnpm init:cloudflare
pnpm deploy
```

`pnpm init:cloudflare` creates or reuses the D1 database and R2 bucket, writes the generated D1 database ID into `wrangler.toml`, and sets the required Worker secrets. It prints the generated `ADMIN_BOOTSTRAP_CODE` once; keep it private for first owner setup.

Common options:

```bash
pnpm init:cloudflare -- --yes
pnpm init:cloudflare -- --db-name your-me3-db --bucket your-me3-assets
pnpm init:cloudflare -- --db-id existing-d1-uuid
pnpm init:cloudflare -- --skip-secrets
pnpm init:cloudflare -- --skip-r2
```

The `pnpm deploy` script runs the build, remote D1 migrations, R2 provisioning check, and Worker deploy. `pnpm deploy:d1-only` is available for constrained experiments, but production Core installs should use the default R2-backed deploy path.

### Recommended Cloudflare Domains

ME3 Core is designed to run one Worker on two custom domains:

- `www.customdomain.com` serves the public ME3 site.
- `me3.customdomain.com` serves the private admin app, login, and `/api/*`.

Set these vars in `wrangler.toml` or in the Cloudflare dashboard:

```toml
CORE_WEB_ORIGIN = "https://me3.customdomain.com"
CORE_API_ORIGIN = "https://me3.customdomain.com"
ME3_ADMIN_HOST = "me3.customdomain.com"
ME3_SITE_HOST = "www.customdomain.com"
# Optional: force the public host to serve a specific claimed site username.
# ME3_SITE_USERNAME = "owner"
```

Then attach both hostnames to the same Worker as Cloudflare Worker custom domains:

```text
www.customdomain.com  -> me3 Worker
me3.customdomain.com  -> me3 Worker
```

If the owner wants the apex domain too, configure Cloudflare to redirect `customdomain.com` to `www.customdomain.com`. Core keeps admin and public-site routing separate by hostname: requests on `ME3_SITE_HOST` serve the published D1-backed site files, while requests on `ME3_ADMIN_HOST` serve the admin SPA and authenticated API.

The site settings page can record a site's desired custom domain. In Core, this does not call the Cloudflare account API or mutate Worker custom domains automatically. The domain shows as active when the recorded domain matches `ME3_SITE_HOST` and, if set, `ME3_SITE_USERNAME` points at that site. Otherwise it stays pending with the Cloudflare setup steps.

### Core File Storage

ME3 Core uses D1 for structured data and R2 for files. The Worker binding is:

```toml
[[r2_buckets]]
binding = "SITE_ASSETS"
bucket_name = "me3-site-assets"
```

When `SITE_ASSETS` is present, media uploads and other Core/plugin files go to R2 automatically. Page metadata, publish manifests, generated HTML, and account data stay in D1.

## Public Distribution

ME3 Core is licensed under the MIT License. See [LICENSE](./LICENSE).

Before redistributing a fork or public template, review [ASSET_PROVENANCE.md](./ASSET_PROVENANCE.md) for included public assets and [SECURITY.md](./SECURITY.md) for responsible disclosure and secret-handling expectations.

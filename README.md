# me3

Installable ME3 Core personal/business AI assistant scaffold.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Soulink-Foundation/me3)

Fastest path: use the deploy button, sign in to Cloudflare, let Cloudflare fork the repo and provision the Worker bindings. First-run setup starts with **Sign in with ME3**; local-only setup is an advanced fallback.

This repository is intentionally small at first. It is not a raw split of `me3-app`; it is the curated first slice that will become a bootable Cloudflare install template.

## First Slice

- Cloudflare Worker shell with health, owner setup, assistant chat placeholder, and public profile/me.json endpoints.
- Vue web shell for local owner setup and setup-required states.
- Minimal D1 schema for install metadata, owner profile, and assistant messages.
- Example install config with no ME3 Cloud production domains, IDs, routes, or secrets.
- Simple provider-free owner auth: a setup password unlocks advanced standalone setup, password login opens the workspace, and httpOnly signed session cookies keep the owner signed in.

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

`pnpm setup:dev-vars` creates `apps/worker/.dev.vars` with generated local-only setup password values. Never commit real secrets.

`pnpm verify:local-boot` is the extraction acceptance gate for the first slice. It applies the local D1 migration, starts the Worker and web shell, checks `/health`, `/api/config`, `/api/admin/bootstrap`, `/api/assistant/chat`, `/.well-known/me.json`, and verifies that the web shell responds.

## Owner Auth

ME3 Core's default first-run path is ME3 Cloud claim: sign in with a `me3.app` account to connect this Core install to the ME3 identity network for Soulink and future apps.

Advanced standalone setup remains available for operators who want a local-only install or who are testing before the hosted claim flow is ready. Standalone setup uses one owner auth secret:

- `SETUP_PASSWORD` unlocks first-run setup and owner credential recovery.

ME3 Core creates its session signing secret and install encryption key automatically in D1 when `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` are not provided. Operators may still set those as external secrets if they want to manage keys outside D1.

Local setup:

```bash
pnpm setup:dev-vars
pnpm --filter @me3-core/worker db:migrate:local
pnpm --filter @me3-core/worker dev
pnpm --filter @me3/web dev
```

Open the web app and choose **Sign in with ME3** to start the network claim flow. Use **Advanced standalone setup** to enter the generated `SETUP_PASSWORD` and create a local owner profile with an email and password. A successful setup stores a password hash in D1 and sets an httpOnly `me3_core_session` cookie. Returning owners sign in with email and password through `/api/auth/login`; the setup password is kept for setup and recovery, not everyday login.

The web app reads `/api/config` to decide whether owner password auth is configured, hydrates refreshes from `/api/auth/me`, and logs out through `/api/auth/logout`; it does not trust localStorage for authentication.

Owner-only Worker routes, including `/api/assistant/chat`, require a valid server-verified session. Public install routes such as `/health`, `/api/config`, and `/.well-known/me.json` remain unauthenticated.

## Mailbox Sender Providers

ME3 Core treats outbound email as a provider adapter system. Core owns mailbox UI, message/thread storage, drafts, send audit, agent approvals, and reply workflow. Provider adapters only handle delivery and inbound transport. Provider tokens are encrypted at rest with the install encryption key and are never returned to the browser or written to `me.json`. Core creates that install key automatically during owner setup when `TOKEN_ENCRYPTION_KEY` is not supplied as an operator-managed override.

The account-level sender settings live in Account -> Mailbox settings:

- Recommended/default: SMTP
- Bring another sender: Postmark, Cloudflare Email Service, Mailgun
- Future provider slots: SES, Resend, SendGrid

SMTP is the default Core outbound adapter. It uses authenticated SMTP submission over port `587` with STARTTLS by default, or port `465` with TLS when selected. Cloudflare Workers cannot send to SMTP port `25`, so Core rejects that port in sender settings. Its fields are host, port, security mode, username, encrypted password, from address, display name, and optional reply-to.

Mailgun is available as a stable external REST adapter. Its fields are API key, sending domain, region (`US` or `EU`), from address, display name, and optional reply-to. Mailgun API keys are encrypted at rest and never returned to the browser.

Postmark is also available as a stable external adapter. Its fields are server API token, confirmed sender signature or verified sender domain, from address, display name, optional reply-to, and message stream (default `outbound`).

Cloudflare Email Service remains available as a Workers-native optional adapter. Required setup is Workers Paid, a sending domain on Cloudflare DNS, a verified sending address or domain, and either a `send_email` binding named `EMAIL` or REST API account ID/token configured through the owner UI. Its fields are from address, display name, optional reply-to, sending domain, transport (`binding` or `rest`), Cloudflare account ID for REST, and API token for REST.

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

`apps/worker/.dev.vars.example` lists local/dev secret names only. `pnpm setup:dev-vars` generates:

- `JWT_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `SETUP_PASSWORD`

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

Cloudflare should provision supported resources from the Wrangler config during button/template deployment. The deploy button should not ask for owner API keys, custom domains, `ENVIRONMENT`, `ME3_AI_MODEL`, `JWT_SECRET`, or `SETUP_PASSWORD`; those are configured later only if the owner needs them.

Cloudflare may still show its own resource and command fields, such as D1 database name/location, R2 bucket name, build command, and deploy command. Keep the defaults unless you have a reason to customize them. The build command creates the web assets, and the deploy command applies D1 migrations before publishing the Worker.

### Deploy Button

Use the button at the top of this README when you want Cloudflare to handle the GitHub fork, Worker build, and supported resource provisioning.

Default setup is **Sign in with ME3**. This connects the Core install to `me3.app` as the coordination layer for identity and future cross-app login.

Standalone fallback setup uses one install secret: `SETUP_PASSWORD`. `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` are generated and stored in D1 if omitted.

OpenAI, Anthropic, email providers, Stripe, OAuth providers, and custom domains are optional owner settings. Configure them later inside the app instead of during the Cloudflare deploy-button flow.

After the first deploy, open the admin URL and choose **Sign in with ME3**. If you need a local-only install, choose **Advanced standalone setup**, enter `SETUP_PASSWORD`, and create the owner account.

If the setup screen asks for a setup password and you do not have one yet, create it as a Worker secret:

1. Open Cloudflare Dashboard -> Workers & Pages -> `me3` -> Settings -> Variables and Secrets.
2. Add a secret named `SETUP_PASSWORD` with a private random value.
3. Save, redeploy the Worker, then enter `SETUP_PASSWORD` on the setup screen.

### Manual CLI Deploy

Use this when testing from a local checkout with your own Cloudflare account:

```bash
pnpm install
pnpm exec wrangler login
pnpm init:cloudflare
pnpm deploy
```

`pnpm init:cloudflare` creates or reuses the D1 database and R2 bucket, writes the generated D1 database ID into `wrangler.toml`, and sets a standalone `SETUP_PASSWORD` secret. It prints that setup password once; keep it private if you plan to use advanced standalone setup.

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

ME3 Core can boot on the generated `workers.dev` URL without a custom domain. Do not add a custom domain during the deploy-button flow unless you already know you need one.

When an owner is ready to use their own domain, set one root domain:

```toml
ME3_CUSTOM_DOMAIN = "customdomain.com"
```

Core infers the hostnames from that one value:

- `me3.customdomain.com` serves the private admin app and login.
- `api.customdomain.com` serves API URLs and `me.json` action links.
- `www.customdomain.com` serves the public ME3 site.

Attach all three hostnames to the same Worker as Cloudflare Worker custom domains:

```text
me3.customdomain.com  -> me3 Worker
api.customdomain.com  -> me3 Worker
www.customdomain.com  -> me3 Worker
```

Advanced installs may still override the inferred values if needed:

```toml
CORE_WEB_ORIGIN = "https://me3.customdomain.com"
CORE_API_ORIGIN = "https://api.customdomain.com"
ME3_ADMIN_HOST = "me3.customdomain.com"
ME3_API_HOST = "api.customdomain.com"
ME3_SITE_HOST = "www.customdomain.com"
# Optional: force the public host to serve a specific claimed site username.
# ME3_SITE_USERNAME = "owner"
```

If the owner wants the apex domain too, configure Cloudflare to redirect `customdomain.com` to `www.customdomain.com`. Core keeps admin, API, and public-site routing separate by hostname.

The site settings page can record a site's desired custom domain. In Core, this does not call the Cloudflare account API or mutate Worker custom domains automatically. The domain shows as active when the recorded domain matches the inferred or explicit public site host and, if set, `ME3_SITE_USERNAME` points at that site. Otherwise it stays pending with the Cloudflare setup steps.

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

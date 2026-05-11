# me3

Installable ME3 Core personal/business AI assistant scaffold.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Soulink-Foundation/me3)

The deploy button works when this repository is publicly reachable. For local development, use the flow below.

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
- `TOKEN_ENCRYPTION_KEY` is reserved for encrypted owner/provider tokens.

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

## Web UI

The Core OSS web app is copied from `me3-app` rather than redesigned from scratch. Calendar, email, sites, and settings use the existing ME3 Vue/Vite UI as the base. `/assistant` is intentionally a placeholder for now, with the existing side navigation entry pointing at it.

## Install Config

`apps/worker/wrangler.core.example.toml` is the first install-template config. It includes only Core bindings and local defaults:

- `DB` D1 binding for Core tables
- `ME3_USER_AGENT` Durable Object binding
- optional `AI` Workers AI binding
- public origin/model vars for local boot

It intentionally excludes production `me3.app` routes, production Cloudflare account/zone IDs, plugin queues, hosted subscription billing config, and real provider secrets.

`apps/worker/.dev.vars.example` lists secret names only. The first required generated local values are:

- `JWT_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `ADMIN_BOOTSTRAP_CODE`

Owner-supplied providers such as OpenAI, Anthropic, Postmark, Stripe, OAuth, and search remain blank until an install owner configures them.

## Cloudflare Deploy Template

The root `wrangler.toml` is the deploy-template config for Cloudflare Workers Builds and the Deploy to Cloudflare button. It defines:

- Worker entrypoint: `apps/worker/src/index.ts`
- Static web assets: `apps/web/dist`
- SPA fallback for copied Vue routes
- Worker-first routing for all paths, so one Worker can route by hostname
- D1 binding and migration directory
- `SITE_ASSETS` R2 binding for Core file storage
- `ME3_USER_AGENT` Durable Object namespace
- optional Workers AI binding
- public origin/model defaults

Cloudflare should provision supported resources from the Wrangler config during template deployment. Required install secrets are described in `package.json` and listed in `apps/worker/.dev.vars.example`.

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

ME3 Core uses D1 for structured data and R2 for files. The default deploy command creates the `me3-site-assets` R2 bucket, binds it to the Worker as `SITE_ASSETS`, and deploys Core:

```bash
pnpm deploy
```

Use a custom bucket name when you need one:

```bash
pnpm storage:r2:provision -- --bucket your-me3-assets
pnpm deploy
```

If the bucket already exists, skip creation and only update the Worker config before deploying:

```bash
pnpm storage:r2:provision -- --bucket your-me3-assets --skip-create
pnpm deploy
```

The Worker binding is:

```toml
[[r2_buckets]]
binding = "SITE_ASSETS"
bucket_name = "me3-site-assets"
```

When `SITE_ASSETS` is present, media uploads and other Core/plugin files go to R2 automatically. Page metadata, publish manifests, generated HTML, and account data stay in D1.

Manual deploy shape:

```bash
pnpm install
pnpm setup:dev-vars
pnpm storage:r2:provision --yes
pnpm build
wrangler d1 migrations apply DB --remote --config wrangler.toml
wrangler deploy --config wrangler.toml
```

The `pnpm deploy` script runs R2 provisioning, the build, remote D1 migration, and Worker deploy in sequence. Use it only after authenticating Wrangler and confirming the generated Cloudflare resource names/IDs. `pnpm deploy:d1-only` is available for local experiments or constrained installs, but production Core installs should use the default R2-backed deploy path.

## Public Distribution

ME3 Core is licensed under the MIT License. See [LICENSE](./LICENSE).

Before redistributing a fork or public template, review [ASSET_PROVENANCE.md](./ASSET_PROVENANCE.md) for included public assets and [SECURITY.md](./SECURITY.md) for responsible disclosure and secret-handling expectations.

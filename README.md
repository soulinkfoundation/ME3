# ME3: a free, open-source personal OS and AI assistant.

It's for those who want to take ownership of their digital life.

With ME3, you can now own your email/calendar/website/AI assistant and more, all in one place for about $5/month.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Soulink-Foundation/me3)

## Why ME3 Exists
Someone once said: We need to reclaim the internet.
A second booming voice said: Me too!
That's when ME3 appeared from the fog.

Everyone should have access to a capable personal AI they own.

## Why Cloudflare

## Setup

## Core principles:

## Customise With Plugins
Plugins are how ME3 gains new abilities.

### Manual CLI Deploy

### Updating ME3 Core

The Deploy to Cloudflare button is for first-time installs. Do not click it again to update an existing ME3 Core install; that can create a new repository, Worker, D1 database, or R2 bucket instead of updating the install you already own.

ME3 Core updates are release-based. Public installs should update from tagged stable releases such as `v0.2.0`, not from whatever is currently on `main`. The goal is WordPress-style ownership: Core code is replaceable, while owner data and customizations live outside Core in D1, R2, Worker secrets, Cloudflare dashboard settings, and eventually plugins/themes.

For a Deploy to Cloudflare install, the copied GitHub/GitLab repository is the install. Cloudflare provisions D1/R2/Durable Object resources and records those bindings in that copied repository's `wrangler.toml`. Updating ME3 Core means merging a tagged upstream release into that copied repository, then letting Cloudflare Workers Builds redeploy the same Worker against the same resources.

ME3 Core's installed version is stored in `me3-core.json`. The root `package.json` name belongs to the copied install and may be changed by Cloudflare to match the user's project, so future Core releases should not use `package.json` as the release version source.

Check for a newer stable release from the copied repository:

```bash
pnpm update:check
```

Update from a deploy-button-created repository with the reusable updater:

```bash
pnpm update:core
git push origin main
```

The updater adds the `upstream` remote if it is missing, fetches release tags, connects copied Deploy-button history to the installed upstream tag when needed, merges the latest stable release, then runs `pnpm install`, `pnpm update:doctor`, and `pnpm build`.

New GitHub-based installs also include an **Update ME3 Core** GitHub Action. In the copied repository, open **Actions -> Update ME3 Core -> Run workflow**. The workflow runs the same updater, commits the result to `main`, and Cloudflare Workers Builds redeploys from that commit.

The workflow also supports a future ME3 dashboard button through GitHub `repository_dispatch` using the `me3-core-update` event type. The dashboard should trigger the same workflow rather than trying to rewrite or redeploy Core from inside the running Worker.

If your install predates `pnpm update:core`, update manually once to the release that adds it, or bootstrap the latest updater from Core:

```bash
curl -fsSL https://raw.githubusercontent.com/Soulink-Foundation/ME3/main/scripts/update-core.mjs -o /tmp/me3-update-core.mjs
node /tmp/me3-update-core.mjs
git push origin main
```

Manual update path:

```bash
git status
git remote add upstream https://github.com/Soulink-Foundation/ME3.git # only needed once
git fetch upstream --tags
git merge vX.Y.Z
pnpm install
pnpm update:doctor
pnpm build
git push origin main
```

Cloudflare Workers Builds should then run the configured deploy command for your repository. That deploy applies any new D1 migrations and publishes the updated Worker against the same D1/R2/Durable Object resources.

If Git reports conflicts in `wrangler.toml`, preserve the values from your copied repository for provisioned resources such as `database_id`, `bucket_name`, Worker name, custom domain vars, and secrets configured in Cloudflare. Then bring in any new Core bindings or migrations from the release and rerun:

```bash
pnpm update:doctor
```

If an early `v0.1.1` test update reports a conflict at the top of `package.json`, keep the copied install's `name` and the release's version value, then continue the merge. Later releases read Core version metadata from `me3-core.json`, which avoids that recurring conflict.

Update from a manual CLI install:

```bash
git status
git fetch upstream --tags
git merge vX.Y.Z
pnpm install
pnpm build
pnpm deploy
```

Before major updates, create or note a Cloudflare D1 Time Travel bookmark. Never overwrite an existing install's `wrangler.toml` resource IDs, Worker secrets, D1 database, R2 bucket, or custom domains unless you intentionally want a fresh install.

### Recommended Cloudflare Domains

ME3 Core can boot on the generated `workers.dev` URL without a custom domain. Do not add a custom domain during the deploy-button flow unless you already know you need one. Before a custom public-site hostname is configured, the first/profile site is published at `/me` on the Worker URL, for example:

```text
https://your-me3.your-account.workers.dev/me
```

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

To serve the public profile directly at the apex instead, set `ME3_SITE_HOST = "customdomain.com"` and attach that hostname to the same Worker. Keep the private admin app on a separate hostname such as `me3.customdomain.com`.

For a simpler two-host setup where the private app and API share the same host, set both origins to the admin host:

```toml
ME3_CUSTOM_DOMAIN = "customdomain.com"
ME3_SITE_HOST = "customdomain.com"
ME3_ADMIN_HOST = "me3.customdomain.com"
CORE_WEB_ORIGIN = "https://me3.customdomain.com"
CORE_API_ORIGIN = "https://me3.customdomain.com"
```

The site settings page can record a site's desired custom domain. In Core, this does not call the Cloudflare account API or mutate Worker custom domains automatically. The domain shows as active when the recorded domain matches the inferred or explicit public site host and, if set, `ME3_SITE_USERNAME` points at that site. Otherwise it stays pending with the Cloudflare setup steps.

### Telegram Agent Channel

Standalone Core installs need their own Telegram bot. See
[`docs/standalone-telegram-setup.md`](./docs/standalone-telegram-setup.md) for
the BotFather, Worker secret, webhook, and account-linking steps.

### Paid Bookings

ME3 Core supports direct Stripe Checkout for paid 1:1 bookings. Payments use the Stripe account configured on your own Core Worker; this is separate from ME3 Cloud subscription billing.

Configure Stripe on the Worker:

```bash
cd apps/worker
pnpm wrangler secret put STRIPE_SECRET_KEY --config wrangler.core.example.toml
```

Use a Stripe secret key from your own Stripe account. After the secret is set, create a paid booking offer in the site wizard, publish the site, and test the booking form from the live `/me` page or your configured public site domain.

Local development can use `apps/worker/.dev.vars` with `STRIPE_SECRET_KEY=sk_test_...`. Do not commit real Stripe keys.

### Core File Storage

ME3 Core uses D1 for structured data and R2 for files.

## Public Distribution

ME3 Core is licensed under the MIT License. See [LICENSE](./LICENSE).

Before redistributing a fork or public template, review [ASSET_PROVENANCE.md](./ASSET_PROVENANCE.md) for included public assets and [SECURITY.md](./SECURITY.md) for responsible disclosure and secret-handling expectations.

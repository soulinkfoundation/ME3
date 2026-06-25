# ME3 How-To Guide

This is the public, agent-readable how-to source for ME3 Core installs. It is meant for ME3, Codex, and other AI agents to answer owner questions without guessing.

Keep this guide:

- Operational: prefer commands, exact setting names, route names, and expected outcomes.
- Safe: never include real secrets, production Cloudflare IDs, hosted billing config, or private owner data.
- Sparse: add a major feature section only when there is useful instruction to put in it.
- Core-aware: clearly separate installable ME3 Core behavior from plugin-owned or hosted-only ME3 Cloud behavior.

When a user asks about something not covered here, say that this guide does not document it yet, then inspect the repo or current install before answering.

## Document Structure

Use one top-level section per major feature. Do not keep empty placeholder sections.

## Cloudflare Components

ME3 Core is a Cloudflare Worker app. The web app is built into Worker assets and managed through the Cloudflare Workers & Pages dashboard; it is not a separate Pages project in this repo.

| Component | ME3 use | Docs |
| --- | --- | --- |
| Workers | Main runtime, API, static assets, scheduled/queue/email handlers | [Workers](https://developers.cloudflare.com/workers/) |
| D1 | Owner data, settings, plugin state, jobs, mailbox metadata | [D1](https://developers.cloudflare.com/d1/) |
| R2 | Site media, mailbox attachments, generated/static artifacts | [R2](https://developers.cloudflare.com/r2/) |
| Queues | Assistant job events, booking reminders, social publishing work | [Queues](https://developers.cloudflare.com/queues/) |
| Custom Domains | Public site host and `me3.<domain>` owner/admin host | [Worker Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) |
| Email Routing | Incoming mailbox mail routed to the Worker email handler | [Email Routing](https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/) |
| Email Service | Optional Cloudflare outbound email sender binding | [Email Sending](https://developers.cloudflare.com/email-service/get-started/send-emails/) |
| Workers AI | Default no-key model provider when the `AI` binding exists | [Workers AI](https://developers.cloudflare.com/workers-ai/) |
| AI Gateway | Usage, token, and cost visibility for model calls | [AI Gateway](https://developers.cloudflare.com/ai-gateway/) |
| Pages | Related Cloudflare product; useful context for the dashboard, but not the current deploy target | [Pages](https://developers.cloudflare.com/pages/) |

## Owner Auth

ME3 Core can protect the owner app with password auth, ME3.app auth, or both. This section covers password auth.

### Short Answer

Do not generate a long-term password hash manually.

For password setup or password recovery, generate a setup/recovery password and store it as a Cloudflare Worker Secret named `SETUP_PASSWORD`. ME3 exposes that value to the Worker as `env.SETUP_PASSWORD`.

The owner then opens the ME3 login page, enters the setup password as the setup code, and chooses their real account password. The Worker hashes the real account password with PBKDF2-SHA256 and stores the hash in D1 at `owner_profile.password_hash`.

### Concepts

- `SETUP_PASSWORD` is a setup and recovery secret. It authorizes first owner bootstrap, custom password setup, and password reset.
- The owner account password is separate from `SETUP_PASSWORD`.
- The owner account password must be at least 8 characters.
- The owner account password hash is stored in D1, not in Cloudflare environment variables.
- Never commit `SETUP_PASSWORD`, `.dev.vars`, `.env`, or real generated secret values to git.

### Configure Password Auth

Preferred production path:

```bash
pnpm init:cloudflare
```

Manual production path:

```bash
SETUP_PASSWORD="$(openssl rand -hex 16)"
printf '%s\n' "$SETUP_PASSWORD" | pnpm exec wrangler secret put SETUP_PASSWORD --config wrangler.toml
printf 'Save this setup password privately: %s\n' "$SETUP_PASSWORD"
unset SETUP_PASSWORD
```

Dashboard production path: Cloudflare Dashboard -> Workers & Pages -> ME3 Worker -> Settings -> Variables and Secrets -> add a `Secret` named `SETUP_PASSWORD`.

Local path:

```bash
pnpm setup:dev-vars
```

This creates ignored local values in `apps/worker/.dev.vars`.

### Bootstrap The First Owner

1. Deploy or run ME3 Core.
2. Open the owner login page. In local dev, this is usually `http://localhost:4000/login`.
3. If the app says setup is required, confirm `SETUP_PASSWORD` exists in Cloudflare or `apps/worker/.dev.vars`.
4. Enter the setup password as the setup code.
5. Enter the owner email, name, and new owner account password.
6. Submit the form.

On success, the Worker calls `POST /api/admin/bootstrap`, stores the owner profile, writes `owner_profile.password_hash`, creates any missing install secrets, and starts an owner session.

### Reset Or Enable Password Auth

Use the same `SETUP_PASSWORD` flow when the owner has forgotten their password or previously only used ME3.app auth.

1. Make sure the current `SETUP_PASSWORD` is known. If it is not known, rotate it with `wrangler secret put SETUP_PASSWORD`.
2. Open the ME3 login page.
3. Use the reset or advanced custom password option shown by the login UI.
4. Enter the owner email, the setup password, and a new account password.

On success, the Worker calls `POST /api/auth/password-reset/bootstrap`, updates `owner_profile.password_hash`, and clears the existing owner session.

### Rotate The Setup Password

Rotate `SETUP_PASSWORD` if it was exposed, lost, shared too broadly, or used during recovery on an untrusted machine.

```bash
SETUP_PASSWORD="$(openssl rand -hex 16)"
printf '%s\n' "$SETUP_PASSWORD" | pnpm exec wrangler secret put SETUP_PASSWORD --config wrangler.toml
printf 'Save the new setup password privately: %s\n' "$SETUP_PASSWORD"
unset SETUP_PASSWORD
```

Rotating `SETUP_PASSWORD` does not change the owner account password. It only changes the secret that authorizes setup and recovery.

### Troubleshooting

- If `/api/config` or `/health` includes `SETUP_PASSWORD` in `setupRequired`, the Worker cannot see `env.SETUP_PASSWORD`.
- If bootstrap fails with `Invalid setup password`, use the exact current setup password or rotate `SETUP_PASSWORD`.
- If login fails after bootstrap, use the owner email and real account password, not the setup password.

## Account Setup

Use Account for owner-facing setup. Keep answers short and point owners back to the UI when it can do the work.

### Deploy Core

Use `pnpm deploy:cloudflare` for manual Cloudflare deploys. It prepares D1/R2 bindings, builds the app, applies D1 migrations, and runs `wrangler deploy`.

Do not use `pnpm deploy`; `deploy` is a pnpm built-in command and can skip ME3's deploy preparation. The `deploy` package script exists for Cloudflare's Deploy button, which provisions declared D1/R2 resources from `wrangler.toml`, then runs migrations and deploys.

### Custom Domain

1. In Cloudflare, add or transfer the domain if needed.
2. In Workers & Pages, open the ME3 Worker and add Custom Domains for the root domain and `me3.<domain>`.
3. In ME3 Account -> Domain & mailbox settings -> Custom domain, save the root domain.
4. After Cloudflare provisions DNS/certificates, visit `https://me3.<domain>` and sign in again.

### Mailbox And Sending

- Receiving mail requires a custom domain and Cloudflare Email Routing.
- In Cloudflare Email Routing, onboard the domain, open Routing rules, create an address such as `assistant@example.com`, choose `Send to worker`, and select the ME3 Worker.
- In ME3 Account -> Mailbox, save the same address. Optional forwarding can send a copy to another inbox.
- Outbound sending can use Cloudflare Email Service, SMTP, Mailgun, or Postmark. SMTP is the stable generic option; Cloudflare Email Service may require a Workers paid plan.
- Test real sending from `/email`; drafting is not the same as sending.

### App Connections

- ME3.app: links hosted ME3 sign-in and public `me.json` preference back to this Core install. Disconnect is only available when password auth remains available.
- Soulink: creates a private Soulink chat between the owner and their ME3 assistant. It requires a live public Core URL; local callback URLs cannot connect.
- Telegram: create a bot with BotFather, save the bot username and token in Account, sync the webhook, then open the setup link or QR code and tap Start in Telegram.

### AI Models And Gateway

- Account -> AI selects the provider and model route for the ME3 agent.
- Workers AI uses the Cloudflare `AI` binding and does not need an API key.
- OpenAI and Anthropic keys can be saved in Account; Core encrypts stored provider secrets and never returns them to the browser.
- AI Gateway usage is backend-only setup. Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as Worker secrets; ME3 uses Cloudflare's `default` gateway.
- Use `/mission-control` -> AI Usage -> Configure for the Cloudflare dashboard steps.
- To set or rotate them manually:

```bash
printf '%s\n' "your-account-id" | pnpm exec wrangler secret put CLOUDFLARE_ACCOUNT_ID --config wrangler.toml
pnpm exec wrangler secret put CLOUDFLARE_API_TOKEN --config wrangler.toml
```

## Core Plugins

Core plugins are first-party capability packs returned by `/api/plugins` and managed in Account -> Plugins.

| Plugin | Current status | Purpose |
| --- | --- | --- |
| ME3 Agent Chat | Bundled, default on | Full assistant chat workspace, voice transcription route, and sandbox replies. |
| ME3 Mission Control | Bundled, default on | Projects, tasks, approvals, private memory, sources, activity, and review surfaces. |
| ME3 Journal | Bundled, optional | Private daily writing, notes, drafts, and longer-form capture. |
| ME3 Accounts | Bundled, optional | Income/expense ledger, categories, CSV import/export, and Stripe-backed context. |
| ME3 Calendar | Bundled | Events, reminders, bookings, birthdays, imports, and recurring event expansion. |
| Local Executor | Bundled, optional setup | Pairs a local runner for approved local tasks with policies, run history, and audit. |
| ME3 Landing Pages | Bundled but coming soon; activation blocked | Landing-page draft generation and rendering package, not a live owner feature unless runtime state proves otherwise. |
| ME3 Social Publishing | Bundled/catalog depending runtime; setup required | Social drafts, connected accounts, queueing, approval-first publishing, and audit history. |

Plugin boundaries:

- Core owns install, auth, account, public profile, `me.json`, and shared runtime wiring.
- Plugins own their domain routes, UI slots, permissions, data, tools, and setup state.
- Hosted-only billing, quotas, managed OAuth bridges, and ME3 Cloud operations stay outside this Core repo.

## Assistant Jobs

Assistant Jobs live in the Assistant workspace. Use the Jobs modal to add starter jobs, pause/resume them, edit schedules, run them manually, duplicate them, or remove them.

Current starter recipes:

| Recipe | State | Purpose |
| --- | --- | --- |
| Weekly Review | Ready | Summarizes Mission Control projects, tasks, approvals, and carry-over choices. |
| Daily Briefing | Ready | Prepares a morning review of tasks, approvals, due items, and optional owner notification. |
| Inbox Watch | Needs setup | Watches scoped email and creates review packets; provider adapters are still setup-dependent. |
| Invoice and Receipt Triage | Needs setup | Extracts receipts/invoices from email and proposes Accounts ledger entries. |
| Booking Reminder | Needs setup | Uses calendar booking events to prepare context and follow-up tasks. |

Job rules for agents:

- Creating a job draft is review-first; saving a confirmed job is an owner action.
- Review packets and ledger entries can require owner review before becoming final.
- If a recipe says `needs_setup`, explain the missing setup rather than claiming it will run.
- Scheduled jobs use owner timezone settings where available; be explicit about dates and times.

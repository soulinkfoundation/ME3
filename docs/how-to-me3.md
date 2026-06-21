# ME3 How-To Guide

This is the public, agent-readable how-to source for ME3 Core installs. It is meant for ME3, Codex, and other AI agents to answer owner questions without guessing.

Keep this guide:

- Operational: prefer commands, exact setting names, route names, and expected outcomes.
- Safe: never include real secrets, production Cloudflare IDs, hosted billing config, or private owner data.
- Sparse: add a major feature section only when there is useful instruction to put in it.
- Core-aware: clearly separate installable ME3 Core behavior from plugin-owned or hosted-only ME3 Cloud behavior.

When a user asks about something not covered here, say that this guide does not document it yet, then inspect the repo or current install before answering.

## Document Structure

Use one top-level section per major feature as this file grows. Good future sections are:

- Install and Updates
- Owner Auth
- AI Providers
- Sites and Domains
- Email
- Calendar and Scheduling
- Assistant Jobs
- Plugins and Local Capabilities
- Data, Security, and Recovery

Do not keep empty placeholder sections. Add a section when it can answer a real owner task.

## Owner Auth

ME3 Core can protect the owner app with password auth, ME3.app auth, or both. This section covers password auth.

### Short Answer

Do not generate a long-term password hash manually.

For password setup or password recovery, generate a setup/recovery password and store it as a Cloudflare Worker Secret named `SETUP_PASSWORD`. ME3 exposes that value to the Worker as `env.SETUP_PASSWORD`.

The owner then opens the ME3 login page, enters the setup password as the setup code, and chooses their real account password. The Worker hashes the real account password with PBKDF2-SHA256 and stores the hash in D1 at `owner_profile.password_hash`.

### Auth Concepts

- `SETUP_PASSWORD` is a setup and recovery secret. It authorizes first owner bootstrap, custom password setup, and password reset.
- The owner account password is separate from `SETUP_PASSWORD`.
- The owner account password must be at least 8 characters.
- The owner account password hash is stored in D1, not in Cloudflare environment variables.
- `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` can be environment secrets, but Core can also create install secrets in D1 when they are missing. They are not the password auth setup code.
- Never commit `SETUP_PASSWORD`, `.dev.vars`, `.env`, or real generated secret values to git.

### Configure Password Auth In Production

Preferred path for a manual Cloudflare install:

```bash
pnpm init:cloudflare
```

That script prepares Cloudflare resources, writes the `SETUP_PASSWORD` Worker Secret, prints the generated setup password once, and tells the owner to save it privately.

Manual path:

```bash
SETUP_PASSWORD="$(openssl rand -hex 16)"
printf '%s\n' "$SETUP_PASSWORD" | pnpm exec wrangler secret put SETUP_PASSWORD --config wrangler.toml
printf 'Save this setup password privately: %s\n' "$SETUP_PASSWORD"
unset SETUP_PASSWORD
```

Cloudflare Dashboard path:

1. Go to Cloudflare Dashboard -> Workers & Pages.
2. Open the ME3 Worker.
3. Go to Settings -> Variables and Secrets.
4. Add a new variable with type `Secret`.
5. Set the name to `SETUP_PASSWORD`.
6. Set the value to a generated setup password such as the output of `openssl rand -hex 16`.
7. Deploy or save the Worker settings.

Use a Cloudflare Secret, not a plaintext variable in `wrangler.toml`. Cloudflare makes Worker secrets available on the Worker `env` object, but hides the stored value after creation.

### Configure Password Auth Locally

Use the repo helper:

```bash
pnpm setup:dev-vars
```

This creates `apps/worker/.dev.vars` with generated local values, including `SETUP_PASSWORD`. The file is ignored by git and must stay local.

If editing manually, put local secrets in `apps/worker/.dev.vars` because the worker dev command runs from `apps/worker`:

```dotenv
SETUP_PASSWORD=replace-with-a-generated-local-setup-password
```

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

### Troubleshooting Password Auth

- If `/api/config` or `/health` includes `SETUP_PASSWORD` in `setupRequired`, the Worker cannot see `env.SETUP_PASSWORD`.
- If the login page says to configure `SETUP_PASSWORD`, add the Worker Secret in Cloudflare or add the local value to `apps/worker/.dev.vars`.
- If bootstrap fails with `Invalid setup password`, use the exact current `SETUP_PASSWORD` value or rotate it.
- If login fails after bootstrap, use the owner email and the real account password, not the setup password.
- If password reset reports `Owner account not found`, use the email stored on the owner profile.

Implementation anchors for agents:

- Worker auth routes: `apps/worker/src/app.ts`
- Worker env type: `apps/worker/src/types.ts`
- Login UI: `apps/web/src/pages/login.vue`
- Web auth store: `apps/web/src/stores/auth.ts`
- Local dev secret helper: `scripts/create-dev-vars.mjs`
- Cloudflare init helper: `scripts/init-cloudflare.mjs`

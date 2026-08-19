import type { Context, Hono } from "hono";
import { getManagedInstallationId, isManagedRuntime } from "../managed-runtime-lifecycle";
import {
  Me3CloudJwtVerificationError,
  verifyMe3CloudJwt,
} from "../me3-cloud-jwt";
import { getCoreWebOrigin } from "../sites";
import type { Env } from "../types";

const MANAGED_SETUP_SESSION_PATH = "/api/auth/managed-setup-session";
const MANAGED_SETUP_TOKEN_AUDIENCE = "me3-managed-setup-session";
const MANAGED_SETUP_TOKEN_TYPE = "me3_managed_setup_session";
const MANAGED_SETUP_TOKEN_MAX_AGE_SECONDS = 5 * 60;
const MANAGED_SETUP_OWNER_SESSION_TTL_SECONDS = 2 * 60 * 60;
const USED_SESSION_SECRET_PREFIX = "ME3_MANAGED_SETUP_SESSION_USED:";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ManagedSetupSessionClaims = {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  typ?: unknown;
  managed_installation_id?: unknown;
  core_install_id?: unknown;
  core_origin?: unknown;
  operator_user_id?: unknown;
  iat?: unknown;
  exp?: unknown;
  jti?: unknown;
};

type ManagedSetupSessionApp = Hono<{ Bindings: Env }>;
type ManagedSetupSessionContext = Context<{ Bindings: Env }>;

export function registerManagedSetupSessionRoutes(
  app: ManagedSetupSessionApp,
  deps: {
    setOwnerSession(
      c: ManagedSetupSessionContext,
      ownerId: string,
      ttlSeconds: number,
    ): Promise<void>;
  },
): void {
  app.get(MANAGED_SETUP_SESSION_PATH, async (c) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Robots-Tag", "noindex, nofollow");

    if (!isManagedRuntime(c.env)) {
      return c.json({ ok: false, error: "Not found" }, 404);
    }

    const token = c.req.query("token")?.trim() || "";
    if (!token || token.length > 8_192) {
      return c.json({ ok: false, error: "Setup session token is required" }, 401);
    }

    let claims: ManagedSetupSessionClaims;
    try {
      claims = await verifyMe3CloudJwt<ManagedSetupSessionClaims>(c.env, token);
    } catch (error) {
      if (
        error instanceof Me3CloudJwtVerificationError &&
        error.kind === "unavailable"
      ) {
        return c.json(
          { ok: false, error: "Setup session authentication is temporarily unavailable" },
          503,
        );
      }
      return c.json({ ok: false, error: "Setup session token was not accepted" }, 401);
    }

    const currentOrigin = getCoreWebOrigin(c.env, c.req.url);
    const installationId = getManagedInstallationId(c.env);
    const [ownerId, coreInstallId] = await Promise.all([
      getInstallSecret(c.env, "ME3_CLOUD_OWNER_ID"),
      getInstallSecret(c.env, "ME3_CORE_INSTALL_ID"),
    ]);

    if (
      !isValidManagedSetupClaims(claims, {
        currentOrigin,
        installationId,
        ownerId,
        coreInstallId,
      })
    ) {
      return c.json({ ok: false, error: "Setup session token was not accepted" }, 403);
    }

    const consumed = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO install_secrets (name, value, created_at, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
      .bind(`${USED_SESSION_SECRET_PREFIX}${claims.jti}`, String(claims.exp))
      .run();
    if (Number(consumed.meta.changes || 0) !== 1) {
      return c.json({ ok: false, error: "Setup session link has already been used" }, 409);
    }

    await deps.setOwnerSession(
      c,
      "owner",
      MANAGED_SETUP_OWNER_SESSION_TTL_SECONDS,
    );
    console.info("Managed setup session opened", {
      installationId,
      operatorUserId: claims.operator_user_id,
    });
    return c.redirect(new URL("/account", currentOrigin).toString(), 302);
  });
}

function isValidManagedSetupClaims(
  claims: ManagedSetupSessionClaims,
  expected: {
    currentOrigin: string;
    installationId: string | null;
    ownerId: string | null;
    coreInstallId: string | null;
  },
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const issuedAt = typeof claims.iat === "number" ? claims.iat : NaN;
  const expiresAt = typeof claims.exp === "number" ? claims.exp : NaN;
  return Boolean(
    expected.installationId &&
      expected.ownerId &&
      expected.coreInstallId &&
      claims.aud === MANAGED_SETUP_TOKEN_AUDIENCE &&
      claims.typ === MANAGED_SETUP_TOKEN_TYPE &&
      claims.sub === expected.ownerId &&
      claims.managed_installation_id === expected.installationId &&
      claims.core_install_id === expected.coreInstallId &&
      claims.core_origin === expected.currentOrigin &&
      typeof claims.operator_user_id === "string" &&
      claims.operator_user_id.length > 0 &&
      typeof claims.jti === "string" &&
      UUID_PATTERN.test(claims.jti) &&
      Number.isInteger(issuedAt) &&
      Number.isInteger(expiresAt) &&
      issuedAt <= nowSeconds + 30 &&
      issuedAt >= nowSeconds - MANAGED_SETUP_TOKEN_MAX_AGE_SECONDS &&
      expiresAt > nowSeconds &&
      expiresAt - issuedAt <= MANAGED_SETUP_TOKEN_MAX_AGE_SECONDS,
  );
}

async function getInstallSecret(env: Env, name: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT value FROM install_secrets WHERE name = ?",
  )
    .bind(name)
    .first<{ value: string }>();
  return row?.value || null;
}

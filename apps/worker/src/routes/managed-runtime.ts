import type { Context, Hono } from "hono";
import {
  MANAGED_RUNTIME_CONTROL_PATH,
  ManagedRuntimeLifecycleError,
  applyManagedRuntimeAction,
  getManagedRuntimeStatus,
  isManagedRuntime,
  isManagedRuntimeAction,
  validateManagedRuntimeControlClaims,
  type ManagedRuntimeControlClaims,
} from "../managed-runtime-lifecycle";
import {
  Me3CloudJwtVerificationError,
  verifyMe3CloudJwt,
} from "../me3-cloud-jwt";
import type { Env } from "../types";

type ManagedRuntimeApp = Hono<{ Bindings: Env }>;
type ManagedRuntimeContext = Context<{ Bindings: Env }>;

export function registerManagedRuntimeRoutes(app: ManagedRuntimeApp): void {
  app.get(MANAGED_RUNTIME_CONTROL_PATH, async (c) => {
    if (!isManagedRuntime(c.env)) return c.json({ ok: false, error: "Not found" }, 404);
    try {
      const claims = await verifyControlToken(c.env, c.req.header("Authorization"));
      validateManagedRuntimeControlClaims(c.env, claims, "status");
      c.header("Cache-Control", "no-store");
      return c.json({ ok: true, runtime: await getManagedRuntimeStatus(c.env) });
    } catch (error) {
      return managedControlError(c, error);
    }
  });

  app.post(MANAGED_RUNTIME_CONTROL_PATH, async (c) => {
    if (!isManagedRuntime(c.env)) return c.json({ ok: false, error: "Not found" }, 404);
    const body = await c.req
      .json<{
        installationId?: unknown;
        action?: unknown;
        requestId?: unknown;
        expectedGeneration?: unknown;
      }>()
      .catch(() => null);
    if (
      !body ||
      typeof body.installationId !== "string" ||
      typeof body.requestId !== "string" ||
      typeof body.expectedGeneration !== "number" ||
      !Number.isSafeInteger(body.expectedGeneration) ||
      Number(body.expectedGeneration) < 1 ||
      !isManagedRuntimeAction(body.action)
    ) {
      return c.json(
        {
          ok: false,
          code: "managed_control_request_invalid",
          error: "Managed runtime control request is invalid",
        },
        400,
      );
    }

    try {
      const claims = await verifyControlToken(c.env, c.req.header("Authorization"));
      const validated = validateManagedRuntimeControlClaims(
        c.env,
        claims,
        body.action,
        body.requestId,
      );
      if (validated.expectedGeneration !== body.expectedGeneration) {
        throw new ManagedRuntimeLifecycleError(
          "Managed runtime control generation was not accepted",
          "managed_control_generation_invalid",
          403,
        );
      }
      const runtime = await applyManagedRuntimeAction(c.env, {
        installationId: body.installationId,
        action: body.action,
        requestId: body.requestId,
        expectedGeneration: body.expectedGeneration,
      });
      c.header("Cache-Control", "no-store");
      return c.json({ ok: true, runtime });
    } catch (error) {
      return managedControlError(c, error);
    }
  });
}

async function verifyControlToken(
  env: Env,
  authorizationHeader: string | undefined,
): Promise<ManagedRuntimeControlClaims> {
  const token = bearerToken(authorizationHeader);
  if (!token) {
    throw new ManagedRuntimeLifecycleError(
      "Managed runtime authentication is required",
      "managed_control_authentication_required",
      401,
    );
  }
  return verifyMe3CloudJwt<ManagedRuntimeControlClaims>(env, token);
}

function bearerToken(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(value.trim());
  return match?.[1] || null;
}

function managedControlError(c: ManagedRuntimeContext, error: unknown) {
  if (error instanceof ManagedRuntimeLifecycleError) {
    return c.json({ ok: false, code: error.code, error: error.message }, error.status);
  }
  if (error instanceof Me3CloudJwtVerificationError) {
    if (error.kind === "unavailable") {
      return c.json(
        {
          ok: false,
          code: "managed_control_keys_unavailable",
          error: "Managed runtime authentication is temporarily unavailable",
        },
        503,
      );
    }
    return c.json(
      {
        ok: false,
        code: "managed_control_token_invalid",
        error: "Managed runtime control token was not accepted",
      },
      401,
    );
  }
  throw error;
}

#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export async function sendManagedInstallWorkflowCallback(
  env = process.env,
  request = globalThis.fetch,
) {
  const callbackUrl = env.ME3_MANAGED_CALLBACK_URL?.trim();
  const callbackSecret = env.ME3_MANAGED_CALLBACK_SECRET?.trim();
  const installationId = env.ME3_MANAGED_INSTALLATION_ID?.trim();
  const status = env.ME3_MANAGED_STATUS?.trim();
  const stage = env.ME3_MANAGED_STAGE?.trim();
  const origin = env.ME3_MANAGED_ORIGIN?.trim();
  const errorCode = env.ME3_MANAGED_ERROR_CODE?.trim();

  if (
    callbackUrl !== "https://api.me3.app/api/managed-install/provisioning/callback" ||
    !callbackSecret ||
    !/^mi-[0-9a-f]{16}$/.test(installationId || "") ||
    !["provisioning", "ready", "failed"].includes(status || "")
  ) {
    throw new Error("managed callback configuration is invalid");
  }

  const response = await request(callbackUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${callbackSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      installationId,
      status,
      ...(stage ? { stage } : {}),
      ...(origin ? { origin } : {}),
      ...(errorCode ? { errorCode } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`managed callback returned ${response.status}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await sendManagedInstallWorkflowCallback();
}

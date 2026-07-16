#!/usr/bin/env node

const callbackUrl = process.env.ME3_MANAGED_CALLBACK_URL?.trim();
const callbackSecret = process.env.ME3_MANAGED_CALLBACK_SECRET?.trim();
const installationId = process.env.ME3_MANAGED_INSTALLATION_ID?.trim();
const status = process.env.ME3_MANAGED_STATUS?.trim();
const stage = process.env.ME3_MANAGED_STAGE?.trim();
const origin = process.env.ME3_MANAGED_ORIGIN?.trim();
const errorCode = process.env.ME3_MANAGED_ERROR_CODE?.trim();

if (
  callbackUrl !== "https://api.me3.app/api/managed-install/provisioning/callback" ||
  !callbackSecret ||
  !/^mi-[0-9a-f]{16}$/.test(installationId || "") ||
  !["provisioning", "ready", "failed"].includes(status || "")
) {
  throw new Error("managed callback configuration is invalid");
}

const response = await fetch(callbackUrl, {
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

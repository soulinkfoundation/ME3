#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const CALLBACK_URL = "https://api.me3.app/api/managed-install/lifecycle/callback";
const OPERATIONS = new Set(["export", "decommission", "cleanup_failed_provision"]);
const STATUSES = new Set(["running", "succeeded", "failed"]);
const ERROR_CODES = new Set([
  "workflow_failed",
  "runtime_upgrade_required",
  "runtime_release_mismatch",
  "runtime_control_unavailable",
]);
const STAGES = new Set([
  "validating",
  "capturing_d1",
  "capturing_r2",
  "verifying_capture",
  "creating_portable",
  "encrypting",
  "retaining",
  "verifying_retention",
  "retention_reverified",
  "runtime_drained",
  "deleting_failed_provision",
  "deleting_r2",
  "removing_consumers",
  "deleting_queues",
  "deleting_worker",
  "deleting_d1",
  "verifying_absence",
  "verified_absent",
  "completed",
]);

export async function sendManagedLifecycleWorkflowCallback(
  env = process.env,
  request = globalThis.fetch,
) {
  const callbackUrl = env.ME3_MANAGED_CALLBACK_URL?.trim();
  const secret = env.ME3_MANAGED_LIFECYCLE_CALLBACK_SECRET?.trim();
  const installationId = env.ME3_MANAGED_INSTALLATION_ID?.trim();
  const operationId = env.ME3_MANAGED_OPERATION_ID?.trim();
  const attemptId = env.ME3_MANAGED_ATTEMPT_ID?.trim();
  const operation = env.ME3_MANAGED_OPERATION?.trim();
  const status = env.ME3_MANAGED_STATUS?.trim();
  const stage = env.ME3_MANAGED_STAGE?.trim();
  const errorCode = env.ME3_MANAGED_ERROR_CODE?.trim();
  const exportObjectKey = env.ME3_MANAGED_EXPORT_OBJECT_KEY?.trim();
  const exportSha256 = env.ME3_MANAGED_EXPORT_SHA256?.trim().toLowerCase();
  const exportMd5 = env.ME3_MANAGED_EXPORT_MD5?.trim().toLowerCase();
  const exportEtag = env.ME3_MANAGED_EXPORT_ETAG?.trim().replace(/^"|"$/g, "").toLowerCase();
  const exportSizeText = env.ME3_MANAGED_EXPORT_SIZE_BYTES?.trim();
  const exportSizeBytes = exportSizeText ? Number(exportSizeText) : null;
  const exportKeyVersion = env.ME3_MANAGED_EXPORT_KEY_VERSION?.trim().toLowerCase();

  if (
    callbackUrl !== CALLBACK_URL ||
    !secret ||
    !/^mi-[0-9a-f]{16}$/.test(installationId || "") ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      operationId || "",
    ) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      attemptId || "",
    ) ||
    !OPERATIONS.has(operation) ||
    !STATUSES.has(status) ||
    !STAGES.has(stage) ||
    (errorCode && !ERROR_CODES.has(errorCode))
  ) {
    throw new Error("managed lifecycle callback configuration is invalid");
  }
  const hasExportEnvironment = Boolean(
    exportObjectKey || exportSha256 || exportMd5 || exportEtag || exportSizeText || exportKeyVersion,
  );
  const includeExport = operation === "export" && status === "succeeded" && stage === "completed";
  if (
    (status === "running" && errorCode) ||
    (status === "failed" && !ERROR_CODES.has(errorCode)) ||
    (status === "succeeded" &&
      ((operation === "export" && stage !== "completed") ||
        (operation === "decommission" && stage !== "verified_absent") ||
        (operation === "cleanup_failed_provision" && stage !== "verified_absent") ||
        errorCode ||
        (operation !== "export" && hasExportEnvironment)))
  ) {
    throw new Error("managed lifecycle callback status transition is invalid");
  }
  if (
    includeExport &&
    (!isSafeExportObjectKey(exportObjectKey, installationId, operationId) ||
      !/^[0-9a-f]{64}$/.test(exportSha256 || "") ||
      !/^[0-9a-f]{32}$/.test(exportMd5 || "") ||
      exportEtag !== exportMd5 ||
      !/^v[1-9][0-9]{0,8}$/.test(exportKeyVersion || "") ||
      !Number.isSafeInteger(exportSizeBytes) ||
      exportSizeBytes <= 0)
  ) {
    throw new Error("managed lifecycle callback export metadata is invalid");
  }

  const response = await request(callbackUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      installationId,
      operationId,
      attemptId,
      operation,
      status,
      stage,
      ...(errorCode ? { errorCode } : {}),
      ...(includeExport
        ? {
            export: {
              format: "me3-managed-export-v1",
              keyVersion: exportKeyVersion,
              objectKey: exportObjectKey,
              sha256: exportSha256,
              md5: exportMd5,
              etag: exportEtag,
              sizeBytes: exportSizeBytes,
            },
          }
        : {}),
    }),
  });
  if (!response.ok) throw new Error(`managed lifecycle callback returned ${response.status}`);
}

function isSafeExportObjectKey(value, installationId, operationId) {
  return (
    typeof value === "string" &&
    value ===
      `managed-exports/${installationId}/${operationId}.me3-managed-export-v1.enc`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await sendManagedLifecycleWorkflowCallback();
}

export const LOCAL_EXECUTOR_PLUGIN_ID = "me3.local-executor";

export const LOCAL_EXECUTOR_RUNTIME = {
  id: LOCAL_EXECUTOR_PLUGIN_ID,
  packageName: "@me3-core/plugin-local-executor",
  bundled: true,
  runtimeStatus: "local_executor_mvp",
  defaultProviderPreset: "opencode",
  notes: [
    "Local Executor stays optional and owner-paired.",
    "Core queues bounded runs; the local runner owns process execution and local logs.",
    "Mission Control remains the owner-facing surface for approvals, history, and results.",
  ],
} as const;

export type LocalExecutorProviderPresetId = "opencode" | "codex" | "claude";

export type LocalExecutorProviderPreset = {
  id: LocalExecutorProviderPresetId;
  label: string;
  command: string;
  args: string[];
  cwd?: string;
};

export type LocalExecutorCommand = {
  command: string;
  args: string[];
  cwd: string;
};

export type LocalExecutorLandingPolicy = "report_only" | "commit" | "push";
export type LocalExecutorAllowedGitTarget = "none" | "branch" | "main";
export type LocalExecutorDirtyRepoPolicy = "block" | "allow";

export type LocalExecutorCaps = {
  maxRuntimeSeconds: number;
  maxOutputChars: number;
  maxArtifactBytes: number;
  maxChangedFiles: number;
};

export type LocalExecutorCommandPolicy = {
  allowCommands: string[];
  denyCommands: string[];
};

export type LocalExecutorProjectPolicy = {
  providerPreset: LocalExecutorProviderPresetId;
  landingPolicy: LocalExecutorLandingPolicy;
  allowedGitTarget: LocalExecutorAllowedGitTarget;
  directMain: boolean;
  dirtyRepo: LocalExecutorDirtyRepoPolicy;
  caps: LocalExecutorCaps;
  commandPolicy: LocalExecutorCommandPolicy;
};

export type LocalExecutorPolicyCheckInput = {
  policy: LocalExecutorProjectPolicy;
  command: LocalExecutorCommand;
  dirtyRepo?: boolean;
  runtimeSeconds?: number;
  outputChars?: number;
  artifactBytes?: number;
  changedFiles?: number;
  requestedLanding?: LocalExecutorLandingPolicy;
  targetBranch?: string | null;
  forcePush?: boolean;
};

export type LocalExecutorPolicyDenial = {
  code:
    | "command_denied"
    | "command_not_allowed"
    | "dirty_repo"
    | "timeout_cap"
    | "output_cap"
    | "artifact_cap"
    | "changed_file_cap"
    | "landing_policy"
    | "git_target"
    | "force_push";
  message: string;
};

export type LocalExecutorPolicyCheck = {
  allowed: boolean;
  denials: LocalExecutorPolicyDenial[];
};

export const LOCAL_EXECUTOR_PROVIDER_PRESETS: Record<
  LocalExecutorProviderPresetId,
  LocalExecutorProviderPreset
> = {
  opencode: {
    id: "opencode",
    label: "OpenCode",
    command: "opencode",
    args: ["run", "--dir", "{repo}", "--format", "json", "{prompt}"],
  },
  codex: {
    id: "codex",
    label: "Codex",
    command: "codex",
    args: ["exec", "--json", "--sandbox", "workspace-write", "--cd", "{repo}", "{prompt}"],
  },
  claude: {
    id: "claude",
    label: "Claude",
    command: "claude",
    args: ["-p", "--output-format", "stream-json", "{prompt}"],
    cwd: "{repo}",
  },
};

export const DEFAULT_LOCAL_EXECUTOR_CAPS: LocalExecutorCaps = {
  maxRuntimeSeconds: 1800,
  maxOutputChars: 24000,
  maxArtifactBytes: 1024 * 1024,
  maxChangedFiles: 50,
};

export const DEFAULT_LOCAL_EXECUTOR_PROJECT_POLICY: LocalExecutorProjectPolicy = {
  providerPreset: "opencode",
  landingPolicy: "report_only",
  allowedGitTarget: "none",
  directMain: false,
  dirtyRepo: "block",
  caps: DEFAULT_LOCAL_EXECUTOR_CAPS,
  commandPolicy: {
    allowCommands: ["opencode", "codex", "claude", "pnpm", "npm", "git"],
    denyCommands: [
      "git reset --hard",
      "git checkout --",
      "git push --force",
      "git push -f",
      "rm -rf ~",
      "find ~",
    ],
  },
};

export const DEFAULT_LOCAL_EXECUTOR_CONFIG = {
  defaultProviderPreset: "opencode",
} as const;

export function renderLocalExecutorProviderCommand(
  preset: LocalExecutorProviderPreset | LocalExecutorProviderPresetId,
  input: { repo: string; prompt: string },
): LocalExecutorCommand {
  const resolvedPreset = typeof preset === "string" ? LOCAL_EXECUTOR_PROVIDER_PRESETS[preset] : preset;
  if (!resolvedPreset) {
    throw new Error("Unknown Local Executor provider preset");
  }

  return {
    command: resolvedPreset.command,
    args: resolvedPreset.args.map((arg) => renderTemplate(arg, input)),
    cwd: renderTemplate(resolvedPreset.cwd || input.repo, input),
  };
}

export function evaluateLocalExecutorPolicy(
  input: LocalExecutorPolicyCheckInput,
): LocalExecutorPolicyCheck {
  const denials: LocalExecutorPolicyDenial[] = [];
  const commandLine = [input.command.command, ...input.command.args].join(" ").trim();
  const commandName = input.command.command.trim();
  const policy = input.policy;
  const caps = { ...DEFAULT_LOCAL_EXECUTOR_CAPS, ...policy.caps };
  const requestedLanding = input.requestedLanding || "report_only";
  const targetBranch = (input.targetBranch || "").trim();

  if (policy.dirtyRepo !== "allow" && input.dirtyRepo) {
    denials.push({
      code: "dirty_repo",
      message: "The project has uncommitted changes and the policy blocks dirty repos.",
    });
  }

  if (matchesAnyCommand(commandLine, policy.commandPolicy.denyCommands)) {
    denials.push({
      code: "command_denied",
      message: "The command matches the project denylist.",
    });
  }

  if (!matchesAllowedCommand(commandName, commandLine, policy.commandPolicy.allowCommands)) {
    denials.push({
      code: "command_not_allowed",
      message: "The command is not in the project allowlist.",
    });
  }

  if (input.runtimeSeconds !== undefined && input.runtimeSeconds > caps.maxRuntimeSeconds) {
    denials.push({
      code: "timeout_cap",
      message: "The run exceeded the project runtime cap.",
    });
  }

  if (input.outputChars !== undefined && input.outputChars > caps.maxOutputChars) {
    denials.push({
      code: "output_cap",
      message: "The run exceeded the project output cap.",
    });
  }

  if (input.artifactBytes !== undefined && input.artifactBytes > caps.maxArtifactBytes) {
    denials.push({
      code: "artifact_cap",
      message: "The run exceeded the project artifact cap.",
    });
  }

  if (input.changedFiles !== undefined && input.changedFiles > caps.maxChangedFiles) {
    denials.push({
      code: "changed_file_cap",
      message: "The run changed more files than the project allows.",
    });
  }

  if (requestedLanding === "commit" && policy.landingPolicy === "report_only") {
    denials.push({
      code: "landing_policy",
      message: "The project is report-only and does not allow commits.",
    });
  }

  if (requestedLanding === "push" && policy.landingPolicy !== "push") {
    denials.push({
      code: "landing_policy",
      message: "The project policy does not allow pushes.",
    });
  }

  if (input.forcePush) {
    denials.push({
      code: "force_push",
      message: "Force pushes are never allowed by Local Executor.",
    });
  }

  if (targetBranch) {
    if (policy.allowedGitTarget === "none") {
      denials.push({
        code: "git_target",
        message: "The project policy does not allow git writes.",
      });
    } else if (targetBranch === "main" && (policy.allowedGitTarget !== "main" || !policy.directMain)) {
      denials.push({
        code: "git_target",
        message: "Direct main changes require explicit project permission.",
      });
    }
  }

  return { allowed: denials.length === 0, denials };
}

export function boundLocalExecutorText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 24))}\n[output truncated]`;
}

function renderTemplate(template: string, input: { repo: string; prompt: string }) {
  return template.replaceAll("{repo}", input.repo).replaceAll("{prompt}", input.prompt);
}

function matchesAnyCommand(commandLine: string, denied: readonly string[]) {
  const normalized = normalizeCommandLine(commandLine);
  return denied.some((entry) => {
    const deniedLine = normalizeCommandLine(entry);
    return deniedLine && normalized.includes(deniedLine);
  });
}

function matchesAllowedCommand(
  commandName: string,
  commandLine: string,
  allowed: readonly string[],
) {
  if (allowed.length === 0) return true;
  const normalizedName = normalizeCommandLine(commandName);
  const normalizedLine = normalizeCommandLine(commandLine);
  return allowed.some((entry) => {
    const normalized = normalizeCommandLine(entry);
    return normalized === normalizedName || normalizedLine.startsWith(`${normalized} `);
  });
}

function normalizeCommandLine(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

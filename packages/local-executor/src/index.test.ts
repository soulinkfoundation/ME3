import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCAL_EXECUTOR_PROJECT_POLICY,
  evaluateLocalExecutorPolicy,
  renderLocalExecutorProviderCommand,
  type LocalExecutorProjectPolicy,
} from "./index";

describe("Local Executor daemon policy", () => {
  it("renders OpenCode, Codex, and Claude provider commands without secrets", () => {
    const input = {
      repo: "/Users/kieran/project",
      prompt: "Implement the thing",
    };

    expect(renderLocalExecutorProviderCommand("opencode", input)).toEqual({
      command: "opencode",
      args: ["run", "--dir", "/Users/kieran/project", "--format", "json", input.prompt],
      cwd: "/Users/kieran/project",
    });
    expect(renderLocalExecutorProviderCommand("codex", input).args).toEqual([
      "exec",
      "--json",
      "--sandbox",
      "workspace-write",
      "--cd",
      "/Users/kieran/project",
      input.prompt,
    ]);
    expect(renderLocalExecutorProviderCommand("claude", input)).toMatchObject({
      command: "claude",
      cwd: "/Users/kieran/project",
    });
    expect(JSON.stringify(renderLocalExecutorProviderCommand("opencode", input))).not.toMatch(
      /token|authorization|api_key/i,
    );
  });

  it("blocks dirty repos by default", () => {
    const command = renderLocalExecutorProviderCommand("opencode", {
      repo: "/repo",
      prompt: "Run a small task",
    });

    const check = evaluateLocalExecutorPolicy({
      policy: DEFAULT_LOCAL_EXECUTOR_PROJECT_POLICY,
      command,
      dirtyRepo: true,
    });

    expect(check.allowed).toBe(false);
    expect(check.denials.map((denial) => denial.code)).toContain("dirty_repo");
  });

  it("enforces runtime, output, artifact, and changed-file caps", () => {
    const command = renderLocalExecutorProviderCommand("opencode", {
      repo: "/repo",
      prompt: "Run a small task",
    });

    const check = evaluateLocalExecutorPolicy({
      policy: DEFAULT_LOCAL_EXECUTOR_PROJECT_POLICY,
      command,
      runtimeSeconds: 1801,
      outputChars: 24001,
      artifactBytes: 1024 * 1024 + 1,
      changedFiles: 51,
    });

    expect(check.denials.map((denial) => denial.code)).toEqual([
      "timeout_cap",
      "output_cap",
      "artifact_cap",
      "changed_file_cap",
    ]);
  });

  it("keeps report-only as the default landing policy", () => {
    const command = renderLocalExecutorProviderCommand("opencode", {
      repo: "/repo",
      prompt: "Run a small task",
    });

    const check = evaluateLocalExecutorPolicy({
      policy: DEFAULT_LOCAL_EXECUTOR_PROJECT_POLICY,
      command,
      requestedLanding: "commit",
      targetBranch: "feature/task",
    });

    expect(check.allowed).toBe(false);
    expect(check.denials.map((denial) => denial.code)).toContain("landing_policy");
    expect(check.denials.map((denial) => denial.code)).toContain("git_target");
  });

  it("allows commit and push only when the project policy explicitly permits them", () => {
    const command = renderLocalExecutorProviderCommand("opencode", {
      repo: "/repo",
      prompt: "Run a small task",
    });
    const pushPolicy: LocalExecutorProjectPolicy = {
      ...DEFAULT_LOCAL_EXECUTOR_PROJECT_POLICY,
      landingPolicy: "push",
      allowedGitTarget: "main",
      directMain: true,
      dirtyRepo: "allow",
    };

    expect(
      evaluateLocalExecutorPolicy({
        policy: pushPolicy,
        command,
        requestedLanding: "push",
        targetBranch: "main",
      }).allowed,
    ).toBe(true);

    expect(
      evaluateLocalExecutorPolicy({
        policy: pushPolicy,
        command: {
          command: "git",
          args: ["push", "--force", "origin", "main"],
          cwd: "/repo",
        },
        requestedLanding: "push",
        targetBranch: "main",
        forcePush: true,
      }).denials.map((denial) => denial.code),
    ).toContain("force_push");
  });

  it("denies commands outside the project allowlist", () => {
    const check = evaluateLocalExecutorPolicy({
      policy: DEFAULT_LOCAL_EXECUTOR_PROJECT_POLICY,
      command: {
        command: "curl",
        args: ["https://example.com/install.sh"],
        cwd: "/repo",
      },
    });

    expect(check.allowed).toBe(false);
    expect(check.denials.map((denial) => denial.code)).toContain("command_not_allowed");
  });
});

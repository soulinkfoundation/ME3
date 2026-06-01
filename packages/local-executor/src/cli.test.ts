import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cliPath = fileURLToPath(
  new URL("../bin/me3-local-executor.mjs", import.meta.url),
);

describe("me3-local-executor CLI", () => {
  it("stores the pairing API URL and reuses it for one-shot claims", async () => {
    const requests: string[] = [];
    const server = createServer((request, response) => {
      requests.push(`${request.method} ${request.url}`);
      response.setHeader("Content-Type", "application/json");

      if (
        request.method === "POST" &&
        request.url === "/api/local-executor/daemon/pairing/complete"
      ) {
        response.end(
          JSON.stringify({
            ok: true,
            runner: { displayName: "Desktop" },
            token: {
              token: "daemon-token",
              runnerId: "desktop",
              tokenType: "bearer",
            },
          }),
        );
        return;
      }

      if (
        request.method === "POST" &&
        request.url === "/api/local-executor/daemon/heartbeat"
      ) {
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (
        request.method === "POST" &&
        request.url === "/api/local-executor/daemon/runs/claim"
      ) {
        response.end(JSON.stringify({ ok: true, run: null }));
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ error: "Not found" }));
    });

    try {
      const apiBase = await listen(server);
      const dir = await mkdtemp(join(tmpdir(), "me3-local-executor-"));
      const tokenStore = join(dir, "token.json");
      const configPath = join(dir, "config.json");

      const pair = await runCli([
        "pair",
        "--api",
        `${apiBase}/api/local-executor`,
        "--code",
        "ABC123",
        "--token-store",
        tokenStore,
      ]);

      expect(pair.stderr).toBe("");
      expect(pair.stdout).toContain("Paired Desktop");

      const token = JSON.parse(await readFile(tokenStore, "utf8"));
      expect(token).toMatchObject({
        token: "daemon-token",
        apiBase: `${apiBase}/api/local-executor`,
      });

      await writeFile(
        configPath,
        JSON.stringify({ tokenStore, logDir: join(dir, "runs") }),
      );

      const once = await runCli(["once", "--config", configPath]);
      expect(once.stderr).toBe("");
      expect(once.stdout).toContain("No approved Local Executor runs to claim.");
      expect(requests).toContain("POST /api/local-executor/daemon/heartbeat");
      expect(requests).toContain("POST /api/local-executor/daemon/runs/claim");
    } finally {
      await close(server);
    }
  });

  it("uses the local config default provider instead of project-specific provider UI", async () => {
    const requests: string[] = [];
    let completionBody: Record<string, unknown> | null = null;
    const server = createServer((request, response) => {
      requests.push(`${request.method} ${request.url}`);
      response.setHeader("Content-Type", "application/json");

      if (
        request.method === "POST" &&
        request.url === "/api/local-executor/daemon/heartbeat"
      ) {
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (
        request.method === "POST" &&
        request.url === "/api/local-executor/daemon/runs/claim"
      ) {
        response.end(
          JSON.stringify({
            ok: true,
            run: {
              id: "run-1",
              provider: "opencode",
              prompt: "Use the local default provider",
              policy: {
                pathHint: tmpdir(),
                caps: { maxRuntimeSeconds: 30, maxOutputChars: 24000 },
              },
            },
          }),
        );
        return;
      }

      if (
        request.method === "POST" &&
        request.url === "/api/local-executor/daemon/runs/run-1/complete"
      ) {
        let body = "";
        request.on("data", (chunk) => {
          body += chunk.toString();
        });
        request.on("end", () => {
          completionBody = JSON.parse(body);
          response.end(
            JSON.stringify({
              ok: true,
              run: { id: "run-1", status: completionBody?.status || "succeeded" },
            }),
          );
        });
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ error: "Not found" }));
    });

    try {
      const apiBase = await listen(server);
      const dir = await mkdtemp(join(tmpdir(), "me3-local-executor-provider-"));
      const tokenStore = join(dir, "token.json");
      const configPath = join(dir, "config.json");

      await writeFile(
        tokenStore,
        JSON.stringify({
          token: "daemon-token",
          apiBase: `${apiBase}/api/local-executor`,
        }),
      );
      await writeFile(
        configPath,
        JSON.stringify({
          tokenStore,
          logDir: join(dir, "runs"),
          defaultProviderPreset: "codex",
          providers: {
            codex: {
              command: process.execPath,
              args: ["-e", "process.stdout.write('codex-provider')"],
            },
          },
        }),
      );

      const once = await runCli(["once", "--config", configPath]);
      expect(once.stderr).toBe("");
      expect(once.stdout).toContain('"id": "run-1"');
      expect(requests).toContain("POST /api/local-executor/daemon/runs/run-1/complete");
      expect(completionBody).toMatchObject({
        status: "succeeded",
        outputPreview: "codex-provider",
      });
    } finally {
      await close(server);
    }
  });
});

function runCli(args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`CLI exited ${code}\n${stdout}\n${stderr}`));
      }
    });
  });
}

function listen(server: Server) {
  return new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Test server did not expose a TCP port");
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(rootDir, "packages/agent-chat/src/index.ts");
const maxLines = 7713;

const source = await readFile(indexPath, "utf8");
const lineCount =
  (source.match(/\n/g)?.length ?? 0) + (source.length > 0 && !source.endsWith("\n") ? 1 : 0);

// ponytail: ratchet only blocks growth; lower maxLines when index.ts shrinks.
if (lineCount > maxLines) {
  console.error(
    `packages/agent-chat/src/index.ts has ${lineCount} lines; keep it at or below ${maxLines}.`,
  );
  console.error("Move touched domains into smaller modules before adding more code here.");
  process.exit(1);
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(rootDir, "apps/web/public/llms.txt");
const knowledgeSourcePath = path.join(rootDir, "packages/knowledge/src/index.ts");
const repositoryUrl = "https://github.com/Soulink-Foundation/me3";

const sourceDocuments = [
  {
    title: "ME3 Core README",
    url: `${repositoryUrl}/blob/main/README.md`,
    description:
      "Installable Core overview, product principles, local setup, deploy flow, and Core vs hosted boundaries.",
  },
  {
    title: "ME3 Knowledge README",
    url: `${repositoryUrl}/blob/main/packages/knowledge/README.md`,
    description:
      "Explains the shared typed product and capability knowledge package that powers this artifact.",
  },
  {
    title: "ME3 Knowledge Source",
    url: `${repositoryUrl}/blob/main/packages/knowledge/src/index.ts`,
    description:
      "Typed product facts, capability map, approval modes, side effects, data boundaries, routes, and agent tool ids.",
  },
  {
    title: "ME3 How-To Guide",
    url: `${repositoryUrl}/blob/main/docs/how-to-me3.md`,
    description:
      "Public configuration and troubleshooting guide for ME3 Core installs.",
  },
];

const knowledgeSource = await readFile(knowledgeSourcePath, "utf8");
const llmsKnowledgeSource = knowledgeSource.replace(
  /^export \* from "\.\/(?:agent-context|bundled-agent-skills)";\n/gm,
  "",
);
const compiledKnowledge = ts.transpileModule(llmsKnowledgeSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const knowledgeModule = await import(
  `data:text/javascript;base64,${Buffer.from(compiledKnowledge.outputText).toString("base64")}`
);

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${knowledgeModule.buildMe3LlmsText({ repositoryUrl, sourceDocuments })}\n`,
  "utf8",
);

console.log(`Generated ${path.relative(rootDir, outputPath)}`);

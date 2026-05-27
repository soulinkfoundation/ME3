#!/usr/bin/env node
import { prepareDeployConfig } from "./lib/deploy-config.mjs";

const args = parseArgs(process.argv.slice(2));

try {
  const result = await prepareDeployConfig({
    templateConfig: args.config,
    manifest: args.manifest,
    output: args.output,
  });

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          configPath: result.configPathRelative,
          generated: result.generated,
          manifestPath: result.manifestPathRelative,
        },
        null,
        2,
      ),
    );
  } else if (result.generated) {
    console.log(`Generated ${result.configPathRelative} from ${result.manifestPathRelative}.`);
  } else {
    console.log(`Using ${result.configPathRelative}; no local install manifest found.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function parseArgs(values) {
  const parsed = {
    config: undefined,
    json: false,
    manifest: undefined,
    output: undefined,
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--") {
      continue;
    } else if (value === "--json") {
      parsed.json = true;
    } else if (value === "--config") {
      parsed.config = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--config=")) {
      parsed.config = value.slice("--config=".length);
    } else if (value === "--manifest") {
      parsed.manifest = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--manifest=")) {
      parsed.manifest = value.slice("--manifest=".length);
    } else if (value === "--output") {
      parsed.output = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--output=")) {
      parsed.output = value.slice("--output=".length);
    } else {
      throw new Error(`Unknown option: ${value}`);
    }
  }

  return parsed;
}

#!/usr/bin/env bun

import { loadConfig } from "./src/config/config.js";
import type { Config } from "./src/config/config.js";
import { NukeCommand, printNukeResults } from "./src/commands/nuke.js";
import { UploadCommand } from "./src/commands/upload.js";
import { DownloadCommand } from "./src/commands/download.js";
import { MigrateCommand } from "./src/commands/migrate.js";
import { LsCommand } from "./src/commands/ls.js";
import { RmCommand } from "./src/commands/rm.js";
import { BucketsCommand } from "./src/commands/buckets.js";
import { LifecycleCommand } from "./src/commands/lifecycle.js";
import { CorsCommand } from "./src/commands/cors.js";
import { StorageClassCommand } from "./src/commands/storage-class.js";
import { PresignCommand } from "./src/commands/presign.js";
import { InfoCommand } from "./src/commands/info.js";
import { DomainsCommand } from "./src/commands/domains.js";
import { DevUrlCommand } from "./src/commands/dev-url.js";
import { TokensCommand } from "./src/commands/tokens.js";
import { StatsCommand } from "./src/commands/stats.js";

const COMMANDS: Record<string, string> = {
  nuke:          "Wipe all objects and multipart uploads from buckets",
  upload:        "Upload files to a bucket",
  download:      "Download files from a bucket",
  migrate:       "Migrate objects between buckets",
  ls:            "List objects in a bucket",
  rm:            "Delete objects selectively (by prefix, age)",
  buckets:       "Manage R2 buckets (list, create, delete, info)",
  lifecycle:     "Manage object lifecycle rules",
  cors:          "Manage CORS policies",
  "storage-class": "Transition storage class for objects",
  presign:       "Generate presigned URLs",
  info:          "Get detailed info about an object",
  domains:       "Manage custom domains (requires API token)",
  "dev-url":     "Manage r2.dev public access (requires API token)",
  tokens:        "Manage bucket-scoped API tokens (requires API token)",
  stats:         "View bucket analytics/metrics (requires API token)",
};

function printMainHelp(): void {
  console.log(`
R2 Tools — CLI toolkit for Cloudflare R2

Usage: r2-tools <command> [options]

Commands:
${Object.entries(COMMANDS)
  .map(([cmd, desc]) => `  ${cmd.padEnd(18)}${desc}`)
  .join("\n")}

Global options:
  --config, -c <path>   Config file path (default: config.json)
  --force, -f           Actually execute destructive operations (default: dry-run)
  --help, -h            Show help

Use 'r2-tools <command> --help' for more info on a command.

Examples:
  r2-tools nuke --force                   # Delete all objects in configured buckets
  r2-tools upload -b my-bucket -s ./file  # Upload a file
  r2-tools ls -b my-bucket -l             # List objects with details
  r2-tools migrate -s old -d new          # Migrate between buckets
`);
}

function parseGlobalArgs(args: string[]): { configPath: string; force: boolean; commandArgs: string[] } {
  let configPath = "config.json";
  let force = false;
  const commandArgs: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;
    if (arg === "--config" || arg === "-c") {
      configPath = args[++i] ?? configPath;
    } else if (arg === "--force" || arg === "-f") {
      force = true;
    } else if ((arg === "--help" || arg === "-h") && commandArgs.length === 0) {
      printMainHelp();
      process.exit(0);
    } else {
      commandArgs.push(arg);
    }
    i++;
  }

  return { configPath, force, commandArgs };
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const { configPath, force, commandArgs } = parseGlobalArgs(rawArgs);

  if (commandArgs.length === 0) {
    printMainHelp();
    process.exit(0);
  }

  const command = commandArgs[0]!;
  const cmdArgs = commandArgs.slice(1);

  if (!COMMANDS[command]) {
    console.error(`Unknown command: '${command}'`);
    console.log("Run 'r2-tools --help' to see available commands.");
    process.exit(1);
  }

  let config: Config;
  try {
    config = loadConfig(configPath);
  } catch (error) {
    console.error(`Failed to load config from ${configPath}: ${(error as Error).message}`);
    console.log("\nExample config.json:");
    console.log(JSON.stringify({
      r2: {
        accessKeyId: "your-access-key",
        secretAccessKey: "your-secret-key",
        endpoint: "https://your-account.r2.cloudflarestorage.com",
        region: "auto",
      },
      accountId: "your-cloudflare-account-id",
      apiToken: "your-cloudflare-api-token",
      buckets: [{ name: "my-bucket", bypass: [] }],
      globalBypass: [],
      dryRun: true,
      concurrency: 10,
    }, null, 2));
    process.exit(1);
  }

  if (force) {
    config.dryRun = false;
  }

  switch (command) {
    case "nuke": {
      const nuker = new NukeCommand(config);
      nuker.setDryRun(config.dryRun);

      let bucket: string | undefined;
      for (let i = 0; i < cmdArgs.length; i++) {
        if (cmdArgs[i] === "--bucket" || cmdArgs[i] === "-b") {
          bucket = cmdArgs[++i];
        }
      }

      const results = await nuker.run(bucket);
      printNukeResults(results, config.dryRun);
      break;
    }

    case "upload": {
      const cmd = new UploadCommand(config);
      await cmd.run(cmdArgs);
      break;
    }

    case "download": {
      const cmd = new DownloadCommand(config);
      await cmd.run(cmdArgs);
      break;
    }

    case "migrate": {
      const cmd = new MigrateCommand(config);
      await cmd.run(cmdArgs);
      break;
    }

    case "ls": {
      const cmd = new LsCommand(config);
      await cmd.run(cmdArgs);
      break;
    }

    case "rm": {
      const cmd = new RmCommand(config);
      await cmd.run(cmdArgs);
      break;
    }

    case "buckets": {
      const cmd = new BucketsCommand(config);
      await cmd.run(cmdArgs);
      break;
    }

    case "lifecycle": {
      const cmd = new LifecycleCommand(config);
      await cmd.run(cmdArgs);
      break;
    }

    case "cors": {
      const cmd = new CorsCommand(config);
      await cmd.run(cmdArgs);
      break;
    }

    case "storage-class": {
      const cmd = new StorageClassCommand(config);
      await cmd.run(cmdArgs);
      break;
    }

    case "presign": {
      const cmd = new PresignCommand(config);
      await cmd.run(cmdArgs);
      break;
    }

    case "info": {
      const cmd = new InfoCommand(config);
      await cmd.run(cmdArgs);
      break;
    }

    case "domains": {
      const cmd = new DomainsCommand(config);
      await cmd.run(cmdArgs);
      break;
    }

    case "dev-url": {
      const cmd = new DevUrlCommand(config);
      await cmd.run(cmdArgs);
      break;
    }

    case "tokens": {
      const cmd = new TokensCommand(config);
      await cmd.run(cmdArgs);
      break;
    }

    case "stats": {
      const cmd = new StatsCommand(config);
      await cmd.run(cmdArgs);
      break;
    }
  }
}

main().catch(console.error);

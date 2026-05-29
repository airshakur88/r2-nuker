#!/usr/bin/env bun

import { loadConfig } from "./src/config.js";
import { R2Nuker } from "./src/nuker.js";

interface CliArgs {
  config: string;
  dryRun: boolean;
  force: boolean;
  bucket?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    config: "config.json",
    dryRun: true,
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--config":
      case "-c":
        result.config = args[++i];
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
      case "--force":
      case "-f":
        result.force = true;
        result.dryRun = false;
        break;
      case "--bucket":
      case "-b":
        result.bucket = args[++i];
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
    }
  }

  return result;
}

function printHelp() {
  console.log(`
R2 Nuker - Cloudflare R2 Bucket Nuker

Usage: bun run index.ts [options]

Options:
  --config, -c <path>    Config file path (default: config.json)
  --dry-run             Run without deleting (default)
  --force, -f           Actually delete files (default: dry-run)
  --bucket, -b <name>   Only nuke specific bucket
  --help, -h            Show this help

Examples:
  bun run index.ts                          # Dry run with default config
  bun run index.ts -c my-config.json        # Use custom config
  bun run index.ts -f                       # Actually delete
  bun run index.ts -f -b my-bucket          # Delete only specific bucket
`);
}

async function main() {
  const args = parseArgs();

  console.log("Loading config from:", args.config);

  let config;
  try {
    config = loadConfig(args.config);
  } catch (error) {
    console.error("Failed to load config:", (error as Error).message);
    console.log("\nExample config.json:");
    console.log(JSON.stringify({
      r2: {
        accessKeyId: "your-access-key",
        secretAccessKey: "your-secret-key",
        endpoint: "https://your-account.r2.cloudflarestorage.com",
        region: "auto"
      },
      buckets: [
        {
          name: "my-bucket",
          bypass: [
            { path: "important/", isPrefix: true },
            { path: "config.json", isPrefix: false }
          ]
        }
      ],
      globalBypass: [
        { path: "system/", isPrefix: true }
      ],
      dryRun: true,
      concurrency: 10
    }, null, 2));
    process.exit(1);
  }

  if (args.bucket) {
    config.buckets = config.buckets.filter((b) => b.name === args.bucket);
    if (config.buckets.length === 0) {
      console.error(`Bucket "${args.bucket}" not found in config`);
      process.exit(1);
    }
  }

  const nuker = new R2Nuker(config);
  nuker.setDryRun(args.dryRun);

  const results = await nuker.nukeAll();

  console.log("\n=== RESULTS ===");
  let totalDeleted = 0;
  let totalBypassed = 0;
  let totalAborted = 0;
  let totalErrors = 0;

  for (const result of results) {
    console.log(`\nBucket: ${result.bucket}`);
    console.log(`  Deleted objects: ${result.deletedObjects}`);
    console.log(`  Bypassed objects: ${result.bypassedObjects}`);
    console.log(`  Aborted uploads: ${result.abortedUploads}`);
    console.log(`  Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      for (const error of result.errors) {
        console.log(`    - ${error}`);
      }
    }

    totalDeleted += result.deletedObjects;
    totalBypassed += result.bypassedObjects;
    totalAborted += result.abortedUploads;
    totalErrors += result.errors.length;
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Total deleted: ${totalDeleted}`);
  console.log(`Total bypassed: ${totalBypassed}`);
  console.log(`Total aborted: ${totalAborted}`);
  console.log(`Total errors: ${totalErrors}`);

  if (args.dryRun) {
    console.log("\nThis was a DRY RUN. Use -f to actually delete.");
  }
}

main().catch(console.error);
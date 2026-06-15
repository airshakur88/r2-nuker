import { R2Client } from "../client/r2-client.js";
import type { Config } from "../config/config.js";
import { formatBytes, formatNumber, parseOlderThan } from "../utils/format.js";
import { BypassChecker } from "../utils/bypass.js";
import { withBatchProgress } from "../utils/progress.js";
import { confirmDestructive } from "../utils/prompt.js";

export class RmCommand {
  private client: R2Client;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.client = new R2Client(config);
  }

  async run(args: string[]): Promise<void> {
    const parsed = this.parseArgs(args);
    if (!parsed) return;

    const { bucket, prefix, olderThan, yes, dryRun } = parsed;

    console.log(`Listing objects in ${bucket}${prefix ? ` with prefix "${prefix}"` : ""}...`);
    let objects = await this.client.listObjects(bucket, prefix);

    if (olderThan) {
      const cutoff = Date.now() - olderThan;
      objects = objects.filter((o) => {
        const modified = o.lastModified ? new Date(o.lastModified).getTime() : 0;
        return modified > 0 && modified < cutoff;
      });
      console.log(`Filtered to ${objects.length} objects older than ${Math.round(olderThan / (24 * 60 * 60 * 1000))} days`);
    }

    if (objects.length === 0) {
      console.log("No objects to delete.");
      return;
    }

    const totalSize = objects.reduce((sum, o) => sum + (o.size ?? 0), 0);
    console.log(`Found ${formatNumber(objects.length)} objects (${formatBytes(totalSize)})`);

    if (prefix) {
      for (const obj of objects.slice(0, 20)) {
        console.log(`  ${obj.key} (${formatBytes(obj.size ?? 0)})`);
      }
      if (objects.length > 20) {
        console.log(`  ... and ${objects.length - 20} more`);
      }
    }

    if (!yes && !dryRun) {
      const confirmed = await confirmDestructive("delete", `${objects.length} objects from ${bucket}`);
      if (!confirmed) {
        console.log("Cancelled.");
        return;
      }
    }

    if (dryRun) {
      console.log(`\n[DRY RUN] Would delete ${objects.length} objects from ${bucket}`);
      return;
    }

    const keys = objects.map((o) => o.key);
    const deleted = await withBatchProgress(
      keys,
      this.config.concurrency,
      async (batch) => {
        return this.client.deleteObjects(bucket, batch);
      },
      "Deleting"
    );

    console.log(`\nDeleted ${deleted} objects from ${bucket}`);
  }

  private parseArgs(args: string[]): { bucket: string; prefix?: string; olderThan?: number; yes: boolean; dryRun: boolean } | null {
    let bucket = "";
    let prefix: string | undefined;
    let olderThan: number | undefined;
    let yes = false;
    let dryRun = false;

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "--bucket":
        case "-b":
          bucket = args[++i] ?? "";
          break;
        case "--prefix":
        case "-p":
          prefix = args[++i];
          break;
        case "--older-than":
          const val = args[++i] ?? "";
          olderThan = parseOlderThan(val);
          if (olderThan === 0) {
            console.error(`Invalid --older-than value: ${val}. Use format like "30d", "12h", "60m"`);
            return null;
          }
          break;
        case "--yes":
        case "-y":
          yes = true;
          break;
        case "--dry-run":
          dryRun = true;
          break;
        case "--help":
        case "-h":
          this.printHelp();
          return null;
      }
    }

    if (!bucket) {
      console.error("Error: --bucket is required");
      this.printHelp();
      return null;
    }

    if (!prefix && !olderThan) {
      console.error("Error: --prefix or --older-than is required (use 'nuke' to delete everything)");
      this.printHelp();
      return null;
    }

    return { bucket, prefix, olderThan, yes, dryRun };
  }

  private printHelp(): void {
    console.log(`
Delete objects from an R2 bucket selectively

Usage: r2-tools rm [options]

Options:
  --bucket, -b <name>        Bucket name (required)
  --prefix, -p <prefix>      Delete objects with this prefix
  --older-than <duration>    Delete objects older than duration (e.g. 30d, 12h, 60m)
  --yes, -y                  Skip confirmation prompt
  --dry-run                  Simulate without deleting
  --help, -h                 Show this help

Examples:
  r2-tools rm -b my-bucket -p temp/
  r2-tools rm -b my-bucket --older-than 30d
  r2-tools rm -b my-bucket -p logs/ --older-than 90d
  r2-tools rm -b my-bucket -p cache/ -y
  r2-tools rm -b my-bucket --older-than 7d --dry-run
`);
  }
}

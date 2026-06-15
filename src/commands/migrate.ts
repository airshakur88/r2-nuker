import { R2Client } from "../client/r2-client.js";
import type { Config } from "../config/config.js";
import { formatBytes, formatNumber } from "../utils/format.js";
import { withProgress } from "../utils/progress.js";

export class MigrateCommand {
  private sourceClient: R2Client;
  private destClient: R2Client;
  private config: Config;

  constructor(config: Config, destConfig?: Config) {
    this.config = config;
    this.sourceClient = new R2Client(config);
    this.destClient = destConfig ? new R2Client(destConfig) : this.sourceClient;
  }

  async run(args: string[]): Promise<void> {
    const parsed = this.parseArgs(args);
    if (!parsed) return;

    const { sourceBucket, destBucket, prefix, storageClass, deleteSource, dryRun } = parsed;

    const isSameAccount = !parsed.destConfig;

    console.log(`Migrating: ${sourceBucket}${prefix ? ` (prefix: ${prefix})` : ""} -> ${destBucket}`);
    if (dryRun) console.log("[DRY RUN MODE - no changes will be made]");

    const objects = await this.sourceClient.listObjects(sourceBucket, prefix);
    const filtered = prefix ? objects.filter((o) => o.key.startsWith(prefix)) : objects;

    if (filtered.length === 0) {
      console.log("No objects found to migrate.");
      return;
    }

    const totalSize = filtered.reduce((sum, o) => sum + (o.size ?? 0), 0);
    console.log(`Found ${formatNumber(filtered.length)} objects (${formatBytes(totalSize)})`);

    let migrated = 0;
    let errors = 0;

    await withProgress(filtered, async (obj) => {
      try {
        if (isSameAccount) {
          if (!dryRun) {
            await this.sourceClient.copyObject(sourceBucket, obj.key, destBucket, obj.key, storageClass);
          }
        } else {
          if (!dryRun) {
            const data = await this.sourceClient.getObject(sourceBucket, obj.key) as Uint8Array;
            await this.destClient.putObject(destBucket, obj.key, data);
          }
        }
        migrated++;
      } catch (error) {
        console.error(`\nFailed to migrate ${obj.key}: ${(error as Error).message}`);
        errors++;
      }
    }, "Migrating");

    console.log(`\nMigration complete: ${migrated}/${filtered.length} objects migrated`);
    if (errors > 0) console.log(`Errors: ${errors}`);

    if (deleteSource && !dryRun && errors === 0) {
      console.log(`\nDeleting source objects from ${sourceBucket}...`);
      const keys = filtered.map((o) => o.key);
      for (let i = 0; i < keys.length; i += this.config.concurrency) {
        const batch = keys.slice(i, i + this.config.concurrency);
        await this.sourceClient.deleteObjects(sourceBucket, batch);
      }
      console.log("Source objects deleted.");
    } else if (deleteSource && dryRun) {
      console.log(`\n[DRY RUN] Would delete ${filtered.length} source objects from ${sourceBucket}`);
    }
  }

  private parseArgs(args: string[]): { sourceBucket: string; destBucket: string; prefix?: string; storageClass?: "STANDARD" | "STANDARD_IA"; deleteSource: boolean; dryRun: boolean; destConfig?: Config } | null {
    let sourceBucket = "";
    let destBucket = "";
    let prefix: string | undefined;
    let storageClass: "STANDARD" | "STANDARD_IA" | undefined;
    let deleteSource = false;
    let dryRun = false;

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "--source":
        case "-s":
          sourceBucket = args[++i] ?? "";
          break;
        case "--dest":
        case "-d":
          destBucket = args[++i] ?? "";
          break;
        case "--prefix":
        case "-p":
          prefix = args[++i];
          break;
        case "--storage-class":
          storageClass = args[++i] as "STANDARD" | "STANDARD_IA";
          break;
        case "--delete-source":
          deleteSource = true;
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

    if (!sourceBucket || !destBucket) {
      console.error("Error: --source and --dest are required");
      this.printHelp();
      return null;
    }

    return { sourceBucket, destBucket, prefix, storageClass, deleteSource, dryRun };
  }

  private printHelp(): void {
    console.log(`
Migrate objects between R2 buckets

Usage: r2-tools migrate [options]

Options:
  --source, -s <bucket>        Source bucket name (required)
  --dest, -d <bucket>          Destination bucket name (required)
  --prefix, -p <prefix>        Only migrate objects with this prefix
  --storage-class <class>      Set storage class (STANDARD, STANDARD_IA)
  --delete-source              Delete objects from source after migration
  --dry-run                    Simulate migration without making changes
  --help, -h                   Show this help

Examples:
  r2-tools migrate -s old-bucket -d new-bucket
  r2-tools migrate -s old-bucket -d new-bucket --prefix logs/
  r2-tools migrate -s old-bucket -d new-bucket --storage-class STANDARD_IA
  r2-tools migrate -s old-bucket -d new-bucket --delete-source
  r2-tools migrate -s old-bucket -d new-bucket --dry-run
`);
  }
}
